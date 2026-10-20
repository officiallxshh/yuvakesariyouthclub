-- Support lookups and joins from YYC tasks to related events.
-- This is a non-destructive index-only change.
create index if not exists yyc_tasks_related_event_id_idx
  on public.yyc_tasks (related_event_id);
