-- YYC event certificate issuance and delivery queue.
-- Additive: attendance records remain authoritative and are not changed by email delivery.

create sequence if not exists public.yyc_certificate_number_seq;

alter table public.events
  add column if not exists certificates_finalized_at timestamptz,
  add column if not exists certificates_finalized_by text;

create table if not exists public.yyc_certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_number text not null unique default (
    'YYC-CERT-' ||
    to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY') ||
    '-' || lpad(nextval('public.yyc_certificate_number_seq')::text, 6, '0')
  ),
  verification_code uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  recipient_kind text not null check (recipient_kind in ('member','leader')),
  recipient_id uuid not null,
  recipient_name text not null,
  recipient_role_number text,
  recipient_email text,
  certificate_type text not null default 'participation'
    check (certificate_type in ('participation','appreciation','volunteer_service')),
  event_title text not null,
  event_date date,
  event_location text,
  email_status text not null default 'queued'
    check (email_status in ('queued','sending','sent','failed','skipped')),
  email_provider_message_id text,
  email_error text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_email_attempt_at timestamptz,
  email_sent_at timestamptz,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  constraint yyc_certificates_unique_event_recipient
    unique (event_id, recipient_kind, recipient_id)
);

create index if not exists yyc_certificates_event_status_idx
  on public.yyc_certificates(event_id, email_status, created_at);
create index if not exists yyc_certificates_recipient_idx
  on public.yyc_certificates(recipient_kind, recipient_id, issued_at desc);
create index if not exists yyc_certificates_verification_idx
  on public.yyc_certificates(verification_code) where revoked_at is null;

alter table public.yyc_certificates enable row level security;
revoke all on table public.yyc_certificates from public, anon, authenticated;
grant all on table public.yyc_certificates to service_role;

create or replace function public.admin_certificate_preview(
  p_token text,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  ev public.events%rowtype;
  people jsonb := '[]'::jsonb;
  eligible_count integer := 0;
  member_count integer := 0;
  leader_count integer := 0;
  missing_email_count integer := 0;
  issued_count integer := 0;
  queued_count integer := 0;
  sent_count integer := 0;
  failed_count integer := 0;
  skipped_count integer := 0;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  select * into ev from public.events where id=p_event_id;
  if not found then
    return jsonb_build_object('ok',false,'error','Event not found');
  end if;

  select
    count(*)::int,
    count(*) filter (where x.kind='member')::int,
    count(*) filter (where x.kind='leader')::int,
    count(*) filter (where not x.email_valid)::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'kind',x.kind,
      'id',x.id,
      'name',x.name,
      'role_number',x.role_number,
      'email_valid',x.email_valid
    ) order by lower(coalesce(x.name,''))), '[]'::jsonb)
  into eligible_count,member_count,leader_count,missing_email_count,people
  from (
    select 'member'::text as kind,m.id,m.name,m.role_number,
      (coalesce(m.email,'') ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.]([A-Z]{2,})$') as email_valid
    from public.attendance a
    join public.members m on m.id=a.member_id
    where a.event_id=p_event_id and a.present=true
      and m.approved=true and lower(coalesce(m.status,'pending'))='approved'
      and m.duplicate_of is null
    union all
    select 'leader'::text as kind,l.id,l.name,coalesce(l.role_number,l.role),
      (coalesce(l.email,'') ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.]([A-Z]{2,})$') as email_valid
    from public.attendance a
    join public.leaders l on l.id=a.leader_id
    where a.event_id=p_event_id and a.present=true
      and lower(coalesce(l.status,'active')) <> 'inactive'
  ) x;

  select
    count(*)::int,
    count(*) filter (where email_status='queued')::int,
    count(*) filter (where email_status='sent')::int,
    count(*) filter (where email_status='failed')::int,
    count(*) filter (where email_status='skipped')::int
  into issued_count,queued_count,sent_count,failed_count,skipped_count
  from public.yyc_certificates where event_id=p_event_id;

  if ev.event_date is null then
    return jsonb_build_object('ok',false,'error','Add an event date before issuing certificates','event_id',ev.id);
  end if;
  if ev.event_date > current_date then
    return jsonb_build_object('ok',false,'error','Certificates can only be issued after the event date has passed','event_id',ev.id,'event_date',ev.event_date);
  end if;

  return jsonb_build_object(
    'ok',true,
    'event',jsonb_build_object(
      'id',ev.id,'title',ev.title,'event_date',ev.event_date,'location',ev.location,
      'certificates_finalized_at',ev.certificates_finalized_at
    ),
    'already_finalized',ev.certificates_finalized_at is not null,
    'eligible_count',eligible_count,
    'member_count',member_count,
    'leader_count',leader_count,
    'missing_email_count',missing_email_count,
    'existing_certificate_count',issued_count,
    'email_status',jsonb_build_object('queued',queued_count,'sent',sent_count,'failed',failed_count,'skipped',skipped_count),
    'recipients',people
  );
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to preview certificates safely');
end
$function$;

create or replace function public.admin_certificate_finalize(
  p_token text,
  p_event_id uuid,
  p_certificate_type text default 'participation'
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  ev public.events%rowtype;
  eligible_count integer := 0;
  inserted_count integer := 0;
  queued_count integer := 0;
  sending_count integer := 0;
  sent_count integer := 0;
  failed_count integer := 0;
  skipped_count integer := 0;
  existing_count integer := 0;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;
  if coalesce(p_certificate_type,'participation') not in ('participation','appreciation','volunteer_service') then
    return jsonb_build_object('ok',false,'error','Choose a supported certificate type');
  end if;

  select * into ev from public.events where id=p_event_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','Event not found');
  end if;
  if ev.event_date is null or ev.event_date > current_date then
    return jsonb_build_object('ok',false,'error','Certificates can only be issued after the event date has passed');
  end if;

  if ev.certificates_finalized_at is not null then
    select
      count(*)::int,
      count(*) filter (where email_status='queued')::int,
      count(*) filter (where email_status='sending')::int,
      count(*) filter (where email_status='sent')::int,
      count(*) filter (where email_status='failed')::int,
      count(*) filter (where email_status='skipped')::int
    into existing_count,queued_count,sending_count,sent_count,failed_count,skipped_count
    from public.yyc_certificates where event_id=p_event_id;
    return jsonb_build_object(
      'ok',true,'already_finalized',true,'event_id',p_event_id,
      'issued_count',existing_count,'new_count',0,
      'email_status',jsonb_build_object('queued',queued_count,'sending',sending_count,'sent',sent_count,'failed',failed_count,'skipped',skipped_count)
    );
  end if;

  select count(*)::int into eligible_count
  from (
    select m.id
    from public.attendance a
    join public.members m on m.id=a.member_id
    where a.event_id=p_event_id and a.present=true
      and m.approved=true and lower(coalesce(m.status,'pending'))='approved'
      and m.duplicate_of is null
    union all
    select l.id
    from public.attendance a
    join public.leaders l on l.id=a.leader_id
    where a.event_id=p_event_id and a.present=true
      and lower(coalesce(l.status,'active')) <> 'inactive'
  ) eligible;

  if eligible_count=0 then
    return jsonb_build_object('ok',false,'error','No eligible people are marked Present for this event');
  end if;

  insert into public.yyc_certificates(
    event_id,recipient_kind,recipient_id,recipient_name,recipient_role_number,recipient_email,
    certificate_type,event_title,event_date,event_location,email_status,email_error
  )
  select
    p_event_id,x.kind,x.id,coalesce(nullif(trim(x.name),''),'YYC Participant'),x.role_number,x.email,
    coalesce(p_certificate_type,'participation'),coalesce(ev.title,'YYC Event'),ev.event_date,ev.location,
    case when x.email_valid then 'queued' else 'skipped' end,
    case when x.email_valid then null else 'No valid email address on record; certificate is available in the portal.' end
  from (
    select 'member'::text as kind,m.id,m.name,m.role_number,m.email,
      (coalesce(m.email,'') ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.]([A-Z]{2,})$') as email_valid
    from public.attendance a
    join public.members m on m.id=a.member_id
    where a.event_id=p_event_id and a.present=true
      and m.approved=true and lower(coalesce(m.status,'pending'))='approved'
      and m.duplicate_of is null
    union all
    select 'leader'::text as kind,l.id,l.name,coalesce(l.role_number,l.role),l.email,
      (coalesce(l.email,'') ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.]([A-Z]{2,})$') as email_valid
    from public.attendance a
    join public.leaders l on l.id=a.leader_id
    where a.event_id=p_event_id and a.present=true
      and lower(coalesce(l.status,'active')) <> 'inactive'
  ) x
  on conflict (event_id,recipient_kind,recipient_id) do nothing;

  get diagnostics inserted_count = row_count;

  update public.events
    set certificates_finalized_at=now(),certificates_finalized_by='Admin',updated_at=now()
  where id=p_event_id and certificates_finalized_at is null;

  perform public.admin_log_activity(
    p_token,
    'certificates_finalized',
    'event',
    p_event_id,
    left('Issued certificates for '||coalesce(ev.title,'YYC event')||' · new: '||inserted_count,240)
  );

  select
    count(*)::int,
    count(*) filter (where email_status='queued')::int,
    count(*) filter (where email_status='sending')::int,
    count(*) filter (where email_status='sent')::int,
    count(*) filter (where email_status='failed')::int,
    count(*) filter (where email_status='skipped')::int
  into existing_count,queued_count,sending_count,sent_count,failed_count,skipped_count
  from public.yyc_certificates where event_id=p_event_id;

  return jsonb_build_object(
    'ok',true,'already_finalized',false,'event_id',p_event_id,
    'issued_count',existing_count,'new_count',inserted_count,
    'email_status',jsonb_build_object('queued',queued_count,'sending',sending_count,'sent',sent_count,'failed',failed_count,'skipped',skipped_count)
  );
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to finalize certificates');
end
$function$;

create or replace function public.admin_certificate_queue_status(
  p_token text,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  counts jsonb;
  items jsonb;
  ev public.events%rowtype;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;
  select * into ev from public.events where id=p_event_id;
  if not found then return jsonb_build_object('ok',false,'error','Event not found'); end if;

  select jsonb_build_object(
    'total',count(*)::int,
    'queued',count(*) filter(where email_status='queued')::int,
    'sending',count(*) filter(where email_status='sending')::int,
    'sent',count(*) filter(where email_status='sent')::int,
    'failed',count(*) filter(where email_status='failed')::int,
    'skipped',count(*) filter(where email_status='skipped')::int
  ) into counts
  from public.yyc_certificates where event_id=p_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'certificate_number',c.certificate_number,
    'recipient_kind',c.recipient_kind,
    'recipient_name',c.recipient_name,
    'recipient_role_number',c.recipient_role_number,
    'recipient_email',c.recipient_email,
    'email_status',c.email_status,
    'email_error',c.email_error,
    'attempt_count',c.attempt_count,
    'email_sent_at',c.email_sent_at,
    'issued_at',c.issued_at,
    'revoked_at',c.revoked_at
  ) order by c.recipient_name),'[]'::jsonb) into items
  from public.yyc_certificates c where c.event_id=p_event_id;

  return jsonb_build_object(
    'ok',true,
    'event',jsonb_build_object('id',ev.id,'title',ev.title,'event_date',ev.event_date,'certificates_finalized_at',ev.certificates_finalized_at),
    'counts',coalesce(counts,'{}'::jsonb),
    'items',coalesce(items,'[]'::jsonb)
  );
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to load certificate delivery status');
end
$function$;

create or replace function public.admin_certificate_retry(
  p_token text,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  queued_count integer := 0;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;
  if not exists (select 1 from public.events where id=p_event_id and certificates_finalized_at is not null) then
    return jsonb_build_object('ok',false,'error','Finalize event attendance before retrying certificate emails');
  end if;

  with candidates as (
    select c.id,
      coalesce(nullif(trim(m.email),''),nullif(trim(l.email),''),nullif(trim(c.recipient_email),'')) as current_email
    from public.yyc_certificates c
    left join public.members m on c.recipient_kind='member' and m.id=c.recipient_id
    left join public.leaders l on c.recipient_kind='leader' and l.id=c.recipient_id
    where c.event_id=p_event_id and c.revoked_at is null
      and (
        c.email_status in ('failed','skipped')
        or (c.email_status='sending' and c.last_email_attempt_at < now()-interval '10 minutes')
      )
  )
  update public.yyc_certificates c
    set recipient_email=can.current_email,
        email_status='queued',
        email_error=null,
        updated_at=now()
  from candidates can
  where c.id=can.id
    and coalesce(can.current_email,'') ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.]([A-Z]{2,})$';

  get diagnostics queued_count = row_count;
  return jsonb_build_object('ok',true,'queued_count',queued_count);
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to queue certificate email retries');
end
$function$;

create or replace function public.yyc_claim_certificate_email_batch(
  p_limit integer default 10,
  p_event_id uuid default null
) returns setof public.yyc_certificates
language sql
security definer
set search_path to 'public','pg_temp'
as $function$
  with candidates as (
    select c.id
    from public.yyc_certificates c
    where c.email_status='queued'
      and c.revoked_at is null
      and (p_event_id is null or c.event_id=p_event_id)
    order by c.created_at,c.id
    for update skip locked
    limit least(greatest(coalesce(p_limit,10),1),15)
  ),
  claimed as (
    update public.yyc_certificates c
      set email_status='sending',
          attempt_count=c.attempt_count+1,
          last_email_attempt_at=now(),
          email_error=null,
          updated_at=now()
    from candidates x
    where c.id=x.id
    returning c.*
  )
  select * from claimed;
$function$;

revoke all on function public.admin_certificate_preview(text,uuid) from public;
revoke all on function public.admin_certificate_finalize(text,uuid,text) from public;
revoke all on function public.admin_certificate_queue_status(text,uuid) from public;
revoke all on function public.admin_certificate_retry(text,uuid) from public;
revoke all on function public.yyc_claim_certificate_email_batch(integer,uuid) from public,anon,authenticated;
grant execute on function public.admin_certificate_preview(text,uuid) to anon,authenticated;
grant execute on function public.admin_certificate_finalize(text,uuid,text) to anon,authenticated;
grant execute on function public.admin_certificate_queue_status(text,uuid) to anon,authenticated;
grant execute on function public.admin_certificate_retry(text,uuid) to anon,authenticated;
grant execute on function public.yyc_claim_certificate_email_batch(integer,uuid) to service_role;

-- Include newly issued certificates in the same backup snapshot already used by YYC Admin.
create or replace function private.yyc_build_backup_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','storage','pg_temp'
as $function$
declare v jsonb;
begin
  v:=private.yyc_build_backup_snapshot_base();
  v:=jsonb_set(v,'{yyc_recycle_bin}',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'entity_type',r.entity_type,'entity_id',r.entity_id,'entity_title',r.entity_title,
      'payload',r.payload,'deleted_by',r.deleted_by,'deleted_at',r.deleted_at,
      'restored_by',r.restored_by,'restored_at',r.restored_at,'purged_by',r.purged_by,'purged_at',r.purged_at
    ) order by r.deleted_at,r.id) from public.yyc_recycle_bin r
  ),'[]'::jsonb),true);
  v:=jsonb_set(v,'{yyc_certificates}',coalesce((
    select jsonb_agg(to_jsonb(c) order by c.issued_at,c.id) from public.yyc_certificates c
  ),'[]'::jsonb),true);
  v:=jsonb_set(v,'{events}',coalesce((
    select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.events e
  ),'[]'::jsonb),true);
  v:=jsonb_set(v,'{table_counts}',coalesce(v->'table_counts','{}'::jsonb)||
    jsonb_build_object(
      'yyc_recycle_bin',(select count(*) from public.yyc_recycle_bin),
      'yyc_certificates',(select count(*) from public.yyc_certificates)
    ),true);
  return v;
end
$function$;
