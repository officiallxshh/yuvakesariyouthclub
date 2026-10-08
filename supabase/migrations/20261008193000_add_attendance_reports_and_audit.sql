-- Attendance reporting, export support, low-attendance alerts and audit-ready logging.
-- Applied to production during YYC WEBSITE BUILD 10.

create or replace function public.admin_record_attendance(
  p_token text,
  p_member_id uuid,
  p_event_id uuid,
  p_present boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  event_title text;
  member_name text;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  select e.title into event_title from public.events e where e.id=p_event_id;
  select m.name into member_name from public.members m where m.id=p_member_id;

  update public.attendance
    set present=coalesce(p_present,true), marked_at=now()
  where member_id=p_member_id and event_id=p_event_id;

  if not found then
    insert into public.attendance(member_id,event_id,present)
    values(p_member_id,p_event_id,coalesce(p_present,true));
  end if;

  perform public.admin_log_activity(
    p_token,'attendance_marked','attendance',p_member_id,
    left(coalesce(member_name,'Member')||' · '||
      case when coalesce(p_present,true) then 'Present' else 'Absent' end||' · '||
      coalesce(event_title,'Event'),240)
  );

  return jsonb_build_object('ok',true);
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to save attendance');
end
$function$;

create or replace function public.admin_record_leader_attendance(
  p_token text,
  p_leader_id uuid,
  p_event_id uuid,
  p_present boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  event_title text;
  leader_name text;
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

  select e.title into event_title from public.events e where e.id=p_event_id;
  select l.name into leader_name from public.leaders l where l.id=p_leader_id;

  update public.attendance
    set present=coalesce(p_present,true), marked_at=now()
  where leader_id=p_leader_id and event_id=p_event_id;

  if not found then
    insert into public.attendance(leader_id,event_id,present)
    values(p_leader_id,p_event_id,coalesce(p_present,true));
  end if;

  perform public.admin_log_activity(
    p_token,'leader_attendance_marked','attendance',p_leader_id,
    left(coalesce(leader_name,'Leader')||' · '||
      case when coalesce(p_present,true) then 'Present' else 'Absent' end||' · '||
      coalesce(event_title,'Event'),240)
  );

  return jsonb_build_object('ok',true);
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to save leader attendance');
end
$function$;

create or replace function public.admin_attendance_reports(
  p_token text,
  p_event_id uuid default null,
  p_threshold numeric default 75
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  threshold numeric := greatest(0, least(100, coalesce(p_threshold,75)));
  completed_count integer := 0;
  summary jsonb;
  history_rows jsonb;
  low_rows jsonb;
  audit_rows jsonb;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  select count(*)::int into completed_count
  from public.events e
  where lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null
    and e.event_date <= current_date;

  select jsonb_build_object(
    'event_id', e.id,
    'event_title', e.title,
    'event_date', e.event_date,
    'location', e.location,
    'member_eligible', (select count(*)::int from public.members m where lower(coalesce(m.status,'pending'))='approved' and coalesce(m.approved,false)=true),
    'member_present', (select count(*)::int from public.attendance a join public.members m on m.id=a.member_id where a.event_id=e.id and a.present=true and lower(coalesce(m.status,'pending'))='approved' and coalesce(m.approved,false)=true),
    'leader_eligible', (select count(*)::int from public.leaders l where lower(coalesce(l.status,'active')) <> 'inactive'),
    'leader_present', (select count(*)::int from public.attendance a join public.leaders l on l.id=a.leader_id where a.event_id=e.id and a.present=true and lower(coalesce(l.status,'active')) <> 'inactive'),
    'member_marked', (select count(*)::int from public.attendance a join public.members m on m.id=a.member_id where a.event_id=e.id and lower(coalesce(m.status,'pending'))='approved' and coalesce(m.approved,false)=true),
    'leader_marked', (select count(*)::int from public.attendance a join public.leaders l on l.id=a.leader_id where a.event_id=e.id and lower(coalesce(l.status,'active')) <> 'inactive')
  ) into summary
  from public.events e
  where e.id=p_event_id;

  if summary is not null then
    summary := summary || jsonb_build_object(
      'member_absent',greatest(0,(summary->>'member_eligible')::int-(summary->>'member_present')::int),
      'leader_absent',greatest(0,(summary->>'leader_eligible')::int-(summary->>'leader_present')::int),
      'member_percentage',case when (summary->>'member_eligible')::int>0 then round(((summary->>'member_present')::numeric*100)/(summary->>'member_eligible')::numeric,2) else 0 end,
      'leader_percentage',case when (summary->>'leader_eligible')::int>0 then round(((summary->>'leader_present')::numeric*100)/(summary->>'leader_eligible')::numeric,2) else 0 end
    );
  end if;

  select coalesce(jsonb_agg(q order by q.marked_at desc),'[]'::jsonb)
  into history_rows
  from (
    select a.id,
      case when a.member_id is not null then 'member' else 'leader' end as kind,
      coalesce(a.member_id,a.leader_id) as person_id,
      coalesce(m.name,l.name) as person_name,
      coalesce(m.role_number,l.role_number) as role_number,
      coalesce(m.position,l.role,'LEADER') as role,
      a.event_id,e.title as event_title,e.event_date,a.present,a.marked_at
    from public.attendance a
    join public.events e on e.id=a.event_id
    left join public.members m on m.id=a.member_id
    left join public.leaders l on l.id=a.leader_id
    where (p_event_id is null or a.event_id=p_event_id)
      and (m.id is not null or l.id is not null)
    order by a.marked_at desc
    limit 2000
  ) q;

  with eligible as (
    select 'member'::text as kind,m.id,m.name,m.role_number,m.position as role
    from public.members m
    where lower(coalesce(m.status,'pending'))='approved' and coalesce(m.approved,false)=true
    union all
    select 'leader'::text,l.id,l.name,l.role_number,l.role
    from public.leaders l
    where lower(coalesce(l.status,'active')) <> 'inactive'
  ),
  present_counts as (
    select case when a.member_id is not null then 'member' else 'leader' end as kind,
      coalesce(a.member_id,a.leader_id) as id,
      count(*) filter (
        where a.present=true
          and lower(coalesce(e.status,'published'))='published'
          and e.event_date is not null
          and e.event_date <= current_date
      )::int as present
    from public.attendance a
    join public.events e on e.id=a.event_id
    group by 1,2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',z.kind,'id',z.id,'name',z.name,'role_number',z.role_number,'role',z.role,
    'present',z.present,'total_events',completed_count,
    'percentage',case when completed_count>0 then round((z.present::numeric*100)/completed_count,2) else 0 end,
    'threshold',threshold
  ) order by case when completed_count>0 then round((z.present::numeric*100)/completed_count,2) else 0 end asc,lower(coalesce(z.name,''))),'[]'::jsonb)
  into low_rows
  from (
    select e.kind,e.id,e.name,e.role_number,e.role,coalesce(p.present,0)::int as present
    from eligible e
    left join present_counts p on p.kind=e.kind and p.id=e.id
  ) z
  where completed_count=0
     or (z.present::numeric*100)/completed_count < threshold;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into audit_rows
  from (
    select id,actor_username,action,entity_type,entity_id,summary,created_at
    from public.admin_activity_log
    where action in ('attendance_marked','leader_attendance_marked')
    order by created_at desc
    limit 250
  ) x;

  return jsonb_build_object(
    'ok',true,'completed_events',completed_count,'threshold',threshold,
    'summary',coalesce(summary,'{}'::jsonb),'history',history_rows,
    'low_attendance',low_rows,'audit',audit_rows,'generated_at',now()
  );
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to load attendance reports');
end
$function$;

revoke execute on function public.admin_attendance_reports(text,uuid,numeric) from public;
grant execute on function public.admin_attendance_reports(text,uuid,numeric) to anon, authenticated;
