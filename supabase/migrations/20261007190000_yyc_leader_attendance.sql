alter table public.attendance add column if not exists leader_id uuid references public.leaders(id) on delete cascade;
create index if not exists idx_attendance_leader_id on public.attendance(leader_id);
create unique index if not exists attendance_leader_event_unique_idx on public.attendance(leader_id,event_id) where leader_id is not null and event_id is not null;
alter table public.attendance drop constraint if exists attendance_member_or_leader_check;
alter table public.attendance add constraint attendance_member_or_leader_check check (
  (member_id is not null and leader_id is null) or
  (member_id is null and leader_id is not null)
);
create or replace function public.admin_record_leader_attendance(
  p_token text, p_leader_id uuid, p_event_id uuid, p_present boolean
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;
  if not exists (
    select 1 from public.leaders
    where id=p_leader_id and lower(coalesce(status,'active')) <> 'inactive'
  ) then
    return jsonb_build_object('ok',false,'error','Active leader not found');
  end if;
  update public.attendance
    set present=coalesce(p_present,true), marked_at=now()
  where leader_id=p_leader_id and event_id=p_event_id;
  if not found then
    insert into public.attendance(leader_id,event_id,present)
    values(p_leader_id,p_event_id,coalesce(p_present,true));
  end if;
  perform public.admin_log_activity(
    p_token,'leader_attendance_marked','attendance',null,
    case when coalesce(p_present,true) then 'Present' else 'Absent' end
  );
  return jsonb_build_object('ok',true);
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to save leader attendance');
end
$function$;