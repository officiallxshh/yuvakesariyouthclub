create table if not exists public.yyc_certificate_counter (
  counter_key text primary key default 'global',
  next_no bigint not null default 1 check (next_no >= 1)
);

insert into public.yyc_certificate_counter(counter_key,next_no)
values ('global',1)
on conflict (counter_key) do nothing;

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_no bigint not null unique,
  certificate_code text not null unique,
  certificate_token uuid not null unique default gen_random_uuid(),
  recipient_kind text not null check (recipient_kind in ('member','leader')),
  recipient_id uuid not null,
  event_id uuid not null references public.events(id) on delete restrict,
  recipient_name text not null,
  recipient_email text,
  recipient_role text,
  event_title text not null,
  event_date date,
  location text,
  status text not null default 'pending' check (status in ('pending','generated','emailed','failed','revoked')),
  storage_path text,
  public_url text,
  error_message text,
  generated_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists certificates_recipient_event_uidx
  on public.certificates(recipient_kind,recipient_id,event_id);
create index if not exists certificates_event_idx
  on public.certificates(event_id,created_at desc);
create index if not exists certificates_status_idx
  on public.certificates(status,created_at desc);
create index if not exists certificates_token_idx
  on public.certificates(certificate_token);

alter table public.certificates enable row level security;

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

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_target_kind||':'||p_target_id::text||':'||p_event_id::text,
      917231
    )
  );

  select c.* into existing
  from public.certificates c
  where c.recipient_kind=p_target_kind
    and c.recipient_id=p_target_id
    and c.event_id=p_event_id
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,
      'existing',true,
      'certificate_id',existing.id,
      'certificate_no',existing.certificate_no,
      'certificate_no_display',lpad(existing.certificate_no::text,2,'0'),
      'certificate_code',existing.certificate_code,
      'certificate_token',existing.certificate_token,
      'recipient_kind',existing.recipient_kind,
      'recipient_id',existing.recipient_id,
      'recipient_name',existing.recipient_name,
      'recipient_email',existing.recipient_email,
      'recipient_role',existing.recipient_role,
      'event_id',existing.event_id,
      'event_title',existing.event_title,
      'event_date',existing.event_date,
      'location',existing.location,
      'status',existing.status,
      'storage_path',existing.storage_path,
      'public_url',existing.public_url
    );
  end if;

  select e.title,e.event_date,e.location,coalesce(e.status,'published')
    into event_title,event_date,event_location,event_status
  from public.events e
  where e.id=p_event_id
  limit 1;

  if event_title is null then
    return jsonb_build_object('ok',false,'error','Event not found');
  end if;

  if lower(coalesce(event_status,''))='cancelled' then
    return jsonb_build_object('ok',false,'error','Certificates cannot be issued for a cancelled event');
  end if;

  if p_target_kind='member' then
    select m.name,m.email,m.position,
           (lower(coalesce(m.status,''))='approved' and coalesce(m.approved,false))
      into target_name,target_email,target_role,target_ok
    from public.members m
    where m.id=p_target_id
    limit 1;
  else
    select l.name,l.email,l.role,
           lower(coalesce(l.status,'active'))<>'inactive'
      into target_name,target_email,target_role,target_ok
    from public.leaders l
    where l.id=p_target_id
    limit 1;
  end if;

  if not target_ok or target_name is null then
    return jsonb_build_object('ok',false,'error','Active recipient not found');
  end if;

  if target_email is null or btrim(target_email)='' then
    return jsonb_build_object('ok',false,'error','Recipient does not have an email address');
  end if;

  if not exists (
    select 1
    from public.attendance a
    where a.event_id=p_event_id
      and a.present=true
      and (
        (p_target_kind='member' and a.member_id=p_target_id) or
        (p_target_kind='leader' and a.leader_id=p_target_id)
      )
  ) then
    return jsonb_build_object('ok',false,'error','Recipient attendance is not marked PRESENT');
  end if;

  select next_no into next_no
  from public.yyc_certificate_counter
  where counter_key='global'
  for update;

  if next_no is null then
    insert into public.yyc_certificate_counter(counter_key,next_no)
    values ('global',2)
    on conflict (counter_key) do nothing;
    select next_no into next_no
    from public.yyc_certificate_counter
    where counter_key='global'
    for update;
  end if;

  update public.yyc_certificate_counter
  set next_no=next_no+1
  where counter_key='global';

  code='YYC-CERT-'||lpad(next_no::text,6,'0');
  new_token=gen_random_uuid();
  new_id=gen_random_uuid();

  insert into public.certificates(
    id,certificate_no,certificate_code,certificate_token,
    recipient_kind,recipient_id,event_id,
    recipient_name,recipient_email,recipient_role,
    event_title,event_date,location,status
  ) values (
    new_id,next_no,code,new_token,
    p_target_kind,p_target_id,p_event_id,
    target_name,target_email,target_role,
    event_title,event_date,event_location,'pending'
  );

  return jsonb_build_object(
    'ok',true,
    'existing',false,
    'certificate_id',new_id,
    'certificate_no',next_no,
    'certificate_no_display',lpad(next_no::text,2,'0'),
    'certificate_code',code,
    'certificate_token',new_token,
    'recipient_kind',p_target_kind,
    'recipient_id',p_target_id,
    'recipient_name',target_name,
    'recipient_email',target_email,
    'recipient_role',target_role,
    'event_id',p_event_id,
    'event_title',event_title,
    'event_date',event_date,
    'location',event_location,
    'status','pending',
    'public_url','https://www.yuvakesariyouthclub.in/certificate.html?token='||new_token::text
  );
exception
  when unique_violation then
    select c.* into existing
    from public.certificates c
    where c.recipient_kind=p_target_kind
      and c.recipient_id=p_target_id
      and c.event_id=p_event_id
    limit 1;
    if found then
      return jsonb_build_object(
        'ok',true,'existing',true,
        'certificate_id',existing.id,
        'certificate_no',existing.certificate_no,
        'certificate_no_display',lpad(existing.certificate_no::text,2,'0'),
        'certificate_code',existing.certificate_code,
        'certificate_token',existing.certificate_token,
        'recipient_kind',existing.recipient_kind,
        'recipient_id',existing.recipient_id,
        'recipient_name',existing.recipient_name,
        'recipient_email',existing.recipient_email,
        'recipient_role',existing.recipient_role,
        'event_id',existing.event_id,
        'event_title',existing.event_title,
        'event_date',existing.event_date,
        'location',existing.location,
        'status',existing.status,
        'storage_path',existing.storage_path,
        'public_url',existing.public_url
      );
    end if;
    raise;
end;
$function$;

grant execute on function public.admin_issue_certificate(text,text,uuid,uuid) to anon, authenticated;

create or replace function public.admin_certificate_history(
  p_token text,
  p_limit integer default 100,
  p_search text default '',
  p_status text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  lim integer := greatest(1,least(coalesce(p_limit,100),200));
  needle text := lower(btrim(coalesce(p_search,'')));
  st text := lower(btrim(coalesce(p_status,'')));
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  return jsonb_build_object(
    'ok',true,
    'items',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          c.id,c.certificate_no,c.certificate_code,c.certificate_token,
          c.recipient_kind,c.recipient_id,c.recipient_name,c.recipient_email,c.recipient_role,
          c.event_id,c.event_title,c.event_date,c.location,c.status,c.storage_path,c.public_url,
          c.error_message,c.generated_at,c.emailed_at,c.created_at,c.updated_at
        from public.certificates c
        where (st='' or lower(c.status)=st)
          and (
            needle='' or
            lower(c.recipient_name) like '%'||needle||'%' or
            lower(c.certificate_code) like '%'||needle||'%' or
            lower(c.event_title) like '%'||needle||'%'
          )
        order by c.created_at desc
        limit lim
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

grant execute on function public.admin_certificate_history(text,integer,text,text) to anon, authenticated;


insert into storage.buckets(id,name,public)
values ('yyc-certificates','yyc-certificates',false)
on conflict (id) do update set public=false;
