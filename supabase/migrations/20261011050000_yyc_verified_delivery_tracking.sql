-- YYC verified delivery tracking: signed provider webhooks + auditable event log.
alter table public.admin_message_deliveries
  drop constraint if exists admin_message_deliveries_status_check;

alter table public.admin_message_deliveries
  add constraint admin_message_deliveries_status_check
  check (status in ('queued','sent','delayed','delivered','bounced','complained','failed','skipped'));

alter table public.admin_message_deliveries
  add column if not exists status_updated_at timestamptz,
  add column if not exists provider_event_type text,
  add column if not exists provider_event_at timestamptz,
  add column if not exists failure_code text;

create index if not exists admin_message_deliveries_provider_message_idx
  on public.admin_message_deliveries(provider, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.admin_message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.admin_message_deliveries(id) on delete cascade,
  provider text not null check (provider in ('resend','meta-whatsapp')),
  provider_event_id text not null,
  provider_message_id text not null,
  event_type text not null,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  constraint admin_message_delivery_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists admin_message_delivery_events_delivery_idx
  on public.admin_message_delivery_events(delivery_id, received_at desc);

create index if not exists admin_message_delivery_events_message_idx
  on public.admin_message_delivery_events(provider, provider_message_id, received_at desc);

alter table public.admin_message_delivery_events enable row level security;

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
          d.error_message, d.failure_code, d.provider_event_type,
          d.provider_event_at, d.status_updated_at,
          d.created_at, d.sent_at, d.delivered_at
        from public.admin_message_deliveries d
        order by d.created_at desc
        limit lim
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.admin_message_history(text, integer) from public;
grant execute on function public.admin_message_history(text, integer) to anon, authenticated;
