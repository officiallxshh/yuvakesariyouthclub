create table if not exists public.yyc_certificate_designs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null default 1,
  provider text not null default 'openai',
  model text,
  reference_image_url text,
  prompt text not null default '',
  output_path text,
  public_url text,
  status text not null default 'pending' check (status in ('pending','generated','failed','archived')),
  is_active boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists yyc_certificate_design_version_uidx
  on public.yyc_certificate_designs(event_id,version);
create index if not exists yyc_certificate_design_event_idx
  on public.yyc_certificate_designs(event_id,created_at desc);
create index if not exists yyc_certificate_design_active_idx
  on public.yyc_certificate_designs(event_id,is_active,created_at desc);

alter table public.yyc_certificate_designs enable row level security;

alter table public.certificates
  add column if not exists design_id uuid references public.yyc_certificate_designs(id) on delete set null;

create index if not exists certificates_design_idx on public.certificates(design_id);

create or replace function public.admin_issue_certificate(
  p_token text,
  p_target_kind text,
  p_target_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  existing public.certificates%rowtype;
  next_no bigint;
  target_name text;
  target_email text;
  target_role text;
  target_ok boolean := false;
  event_title text;
  event_date date;
  event_location text;
  event_status text;
  design_id uuid;
  design_url text;
  new_id uuid;
  new_token uuid;
  code text;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  if p_target_kind not in ('member','leader') then
    return jsonb_build_object('ok',false,'error','Invalid certificate recipient type');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_target_kind||':'||p_target_id::text||':'||p_event_id::text,917231));

  select c.* into existing
  from public.certificates c
  where c.recipient_kind=p_target_kind
    and c.recipient_id=p_target_id
    and c.event_id=p_event_id
  limit 1;

  if found then
    select d.id,d.public_url into design_id,design_url
    from public.yyc_certificate_designs d
    where d.id=existing.design_id
    limit 1;
    return jsonb_build_object(
      'ok',true,'existing',true,'certificate_id',existing.id,
      'certificate_no',existing.certificate_no,
      'certificate_no_display',lpad(existing.certificate_no::text,2,'0'),
      'certificate_code',existing.certificate_code,
      'certificate_token',existing.certificate_token,
      'recipient_kind',existing.recipient_kind,'recipient_id',existing.recipient_id,
      'recipient_name',existing.recipient_name,'recipient_email',existing.recipient_email,
      'recipient_role',existing.recipient_role,'event_id',existing.event_id,
      'event_title',existing.event_title,'event_date',existing.event_date,'location',existing.location,
      'status',existing.status,'storage_path',existing.storage_path,'public_url',existing.public_url,
      'design_id',design_id,'design_url',design_url
    );
  end if;

  select e.title,e.event_date,e.location,coalesce(e.status,'published')
    into event_title,event_date,event_location,event_status
  from public.events e where e.id=p_event_id limit 1;

  if event_title is null then return jsonb_build_object('ok',false,'error','Event not found'); end if;
  if lower(coalesce(event_status,''))='cancelled' then
    return jsonb_build_object('ok',false,'error','Certificates cannot be issued for a cancelled event');
  end if;

  if p_target_kind='member' then
    select m.name,m.email,m.position,
      (lower(coalesce(m.status,''))='approved' and coalesce(m.approved,false))
      into target_name,target_email,target_role,target_ok
    from public.members m where m.id=p_target_id limit 1;
  else
    select l.name,l.email,l.role,
      lower(coalesce(l.status,'active'))<>'inactive'
      into target_name,target_email,target_role,target_ok
    from public.leaders l where l.id=p_target_id limit 1;
  end if;

  if not target_ok or target_name is null then
    return jsonb_build_object('ok',false,'error','Active recipient not found');
  end if;
  if target_email is null or btrim(target_email)='' then
    return jsonb_build_object('ok',false,'error','Recipient does not have an email address');
  end if;

  if not exists (
    select 1 from public.attendance a
    where a.event_id=p_event_id and a.present=true
      and ((p_target_kind='member' and a.member_id=p_target_id)
        or (p_target_kind='leader' and a.leader_id=p_target_id))
  ) then
    return jsonb_build_object('ok',false,'error','Recipient attendance is not marked PRESENT');
  end if;

  select d.id,d.public_url into design_id,design_url
  from public.yyc_certificate_designs d
  where d.event_id=p_event_id and d.is_active=true and d.status='generated'
  order by d.created_at desc limit 1;

  select cnext.next_no into next_no
  from public.yyc_certificate_counter cnext
  where cnext.counter_key='global'
  for update;

  if next_no is null then
    insert into public.yyc_certificate_counter(counter_key,next_no)
    values ('global',2) on conflict (counter_key) do nothing;
    select cnext.next_no into next_no
    from public.yyc_certificate_counter cnext
    where cnext.counter_key='global' for update;
  end if;

  update public.yyc_certificate_counter set next_no=next_no+1 where counter_key='global';

  code='YYC-CERT-'||lpad(next_no::text,6,'0');
  new_token=gen_random_uuid();
  new_id=gen_random_uuid();

  insert into public.certificates(
    id,certificate_no,certificate_code,certificate_token,
    recipient_kind,recipient_id,event_id,recipient_name,recipient_email,recipient_role,
    event_title,event_date,location,status,design_id
  ) values (
    new_id,next_no,code,new_token,p_target_kind,p_target_id,p_event_id,
    target_name,target_email,target_role,event_title,event_date,event_location,'pending',design_id
  );

  return jsonb_build_object(
    'ok',true,'existing',false,'certificate_id',new_id,'certificate_no',next_no,
    'certificate_no_display',lpad(next_no::text,2,'0'),'certificate_code',code,
    'certificate_token',new_token,'recipient_kind',p_target_kind,'recipient_id',p_target_id,
    'recipient_name',target_name,'recipient_email',target_email,'recipient_role',target_role,
    'event_id',p_event_id,'event_title',event_title,'event_date',event_date,'location',event_location,
    'status','pending','design_id',design_id,'design_url',design_url,
    'public_url','https://www.yuvakesariyouthclub.in/certificate.html?token='||new_token::text
  );
exception
  when unique_violation then
    select c.* into existing
    from public.certificates c
    where c.recipient_kind=p_target_kind and c.recipient_id=p_target_id and c.event_id=p_event_id
    limit 1;
    if found then
      return jsonb_build_object(
        'ok',true,'existing',true,'certificate_id',existing.id,
        'certificate_no',existing.certificate_no,
        'certificate_no_display',lpad(existing.certificate_no::text,2,'0'),
        'certificate_code',existing.certificate_code,'certificate_token',existing.certificate_token,
        'recipient_kind',existing.recipient_kind,'recipient_id',existing.recipient_id,
        'recipient_name',existing.recipient_name,'recipient_email',existing.recipient_email,
        'recipient_role',existing.recipient_role,'event_id',existing.event_id,
        'event_title',existing.event_title,'event_date',existing.event_date,'location',existing.location,
        'status',existing.status,'storage_path',existing.storage_path,'public_url',existing.public_url,
        'design_id',existing.design_id
      );
    end if;
    raise;
end;
$function$;

grant execute on function public.admin_issue_certificate(text,text,uuid,uuid) to anon, authenticated;

create or replace function public.admin_certificate_design_history(
  p_token text,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;
  return jsonb_build_object(
    'ok',true,
    'items',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select d.id,d.event_id,d.version,d.provider,d.model,d.reference_image_url,d.prompt,
               d.output_path,d.public_url,d.status,d.is_active,d.error_message,d.metadata,
               d.created_at,d.updated_at,e.title event_title,e.event_date
        from public.yyc_certificate_designs d
        join public.events e on e.id=d.event_id
        where p_event_id is null or d.event_id=p_event_id
        order by d.created_at desc limit 100
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

grant execute on function public.admin_certificate_design_history(text,uuid) to anon, authenticated;
