-- YYC admin-uploaded personal certificates with private storage and delivery tracking.
-- Apply after 20261013150000_yyc_certificate_delivery_workflow.sql.
-- Uploaded PDFs remain private; the Edge Function authorizes recipient downloads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yyc-certificates', 'yyc-certificates', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

create table if not exists public.yyc_manual_certificates (
  id uuid primary key default gen_random_uuid(),
  recipient_kind text not null check (recipient_kind in ('member','leader')),
  recipient_id uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  event_title text not null default '' check (char_length(event_title) <= 180),
  original_file_name text not null check (char_length(original_file_name) between 1 and 180),
  storage_path text not null unique,
  content_type text not null default 'application/pdf' check (content_type = 'application/pdf'),
  file_size bigint not null check (file_size between 1 and 10485760),
  email_status text not null default 'queued'
    check (email_status in ('queued','sent','failed','skipped')),
  email_provider_message_id text,
  email_error text,
  email_sent_at timestamptz,
  uploaded_by text not null default 'Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  viewed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text
);

create index if not exists yyc_manual_certificates_recipient_idx
  on public.yyc_manual_certificates(recipient_kind, recipient_id, created_at desc)
  where revoked_at is null;
create index if not exists yyc_manual_certificates_email_status_idx
  on public.yyc_manual_certificates(email_status, created_at);

alter table public.yyc_manual_certificates enable row level security;
revoke all on table public.yyc_manual_certificates from public, anon, authenticated;
grant all on table public.yyc_manual_certificates to service_role;

-- Preserve certificate and upload metadata in the existing validated Admin backup.
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
  v:=jsonb_set(v,'{yyc_manual_certificates}',coalesce((
    select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.yyc_manual_certificates c
  ),'[]'::jsonb),true);
  v:=jsonb_set(v,'{events}',coalesce((
    select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.events e
  ),'[]'::jsonb),true);
  v:=jsonb_set(v,'{table_counts}',coalesce(v->'table_counts','{}'::jsonb)||
    jsonb_build_object(
      'yyc_recycle_bin',(select count(*) from public.yyc_recycle_bin),
      'yyc_certificates',(select count(*) from public.yyc_certificates),
      'yyc_manual_certificates',(select count(*) from public.yyc_manual_certificates)
    ),true);
  return v;
end
$function$;
