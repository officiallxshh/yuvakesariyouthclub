create table if not exists public.admin_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  recipient_kind text not null check (recipient_kind in ('member','leader')),
  recipient_id uuid not null,
  recipient_name text not null default '',
  channel text not null check (channel in ('email','whatsapp','sms')),
  message_type text not null default 'general' check (message_type in ('general','membership','event','system','certificate')),
  subject text,
  title text not null,
  body text not null default '',
  link text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','skipped')),
  provider text,
  provider_message_id text,
  recipient_address text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz
);

create index if not exists admin_message_deliveries_created_idx
  on public.admin_message_deliveries(created_at desc);
create index if not exists admin_message_deliveries_recipient_idx
  on public.admin_message_deliveries(recipient_kind, recipient_id, created_at desc);
create index if not exists admin_message_deliveries_status_idx
  on public.admin_message_deliveries(status, created_at desc);

alter table public.admin_message_deliveries enable row level security;

create or replace function public.admin_message_history(p_token text, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  lim integer := greatest(1, least(coalesce(p_limit,50), 100));
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          d.id, d.batch_id, d.recipient_kind, d.recipient_id, d.recipient_name,
          d.channel, d.message_type, d.subject, d.title, d.body, d.link,
          d.status, d.provider, d.provider_message_id, d.recipient_address,
          d.error_message, d.created_at, d.sent_at, d.delivered_at
        from public.admin_message_deliveries d
        order by d.created_at desc
        limit lim
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

grant execute on function public.admin_message_history(text, integer) to anon, authenticated;
