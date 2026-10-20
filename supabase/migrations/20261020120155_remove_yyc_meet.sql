-- Retire YYC Meet completely while retaining legacy records for internal archival.
-- The public Meet UI has been removed from the website; these RPCs should no longer be exposed.

drop function if exists public.yyc_meet_attendance(text, text, uuid, text, text);
drop function if exists public.yyc_meet_lookup(text);
drop function if exists public.yyc_meet_portal(text, text, jsonb);

-- Move the legacy meeting data out of the exposed public API schema instead of
-- destroying it. The private schema has no USAGE grants for anon/authenticated.
alter table public.yyc_meeting_attendance set schema private;
alter table public.yyc_meetings set schema private;

revoke all on table private.yyc_meeting_attendance from public, anon, authenticated;
revoke all on table private.yyc_meetings from public, anon, authenticated;

comment on table private.yyc_meetings is
  'Archived legacy YYC Meet records. The public meeting feature and RPCs were retired; data retained for internal reference.';
comment on table private.yyc_meeting_attendance is
  'Archived legacy YYC Meet attendance records. The public meeting feature and RPCs were retired; data retained for internal reference.';

notify pgrst, 'reload schema';
