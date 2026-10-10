-- Attendance denominator includes only completed published events with explicit Present/Absent entries.
CREATE OR REPLACE FUNCTION public.member_dashboard_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  mid uuid;
  completed_events integer := 0;
  recorded_events integer := 0;
  events_attended integer := 0;
  history_rows jsonb;
  attended_rows jsonb;
  upcoming_rows jsonb;
  activity_rows jsonb;
begin
  mid := public._member_id(p_token);
  if mid is null then return jsonb_build_object('ok',false,'error','Session expired'); end if;
  if not exists(select 1 from public.members m where m.id=mid and coalesce(m.approved,false)=true and lower(coalesce(m.status,'approved'))='approved') then
    return jsonb_build_object('ok',false,'error','Approved member access required');
  end if;

  select count(*)::int into completed_events
  from public.events e
  where lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null and e.event_date<=current_date
    and (e.publish_at is null or e.publish_at<=now());

  select count(distinct a.event_id)::int into recorded_events
  from public.attendance a join public.events e on e.id=a.event_id
  where a.member_id=mid
    and lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null and e.event_date<=current_date
    and (e.publish_at is null or e.publish_at<=now());

  select count(distinct a.event_id)::int into events_attended
  from public.attendance a join public.events e on e.id=a.event_id
  where a.member_id=mid and a.present=true
    and lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null and e.event_date<=current_date
    and (e.publish_at is null or e.publish_at<=now());

  select coalesce(jsonb_agg(to_jsonb(h) order by h.event_date desc nulls last,h.marked_at desc),'[]'::jsonb)
  into history_rows
  from (
    select a.id,a.event_id,e.title as event_title,e.event_date,e.location,a.present,a.marked_at
    from public.attendance a join public.events e on e.id=a.event_id
    where a.member_id=mid
    order by e.event_date desc nulls last,a.marked_at desc limit 12
  ) h;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.event_date desc nulls last,h.marked_at desc),'[]'::jsonb)
  into attended_rows
  from (
    select distinct on (a.event_id) a.id,a.event_id,e.title as event_title,e.event_date,e.location,a.present,a.marked_at
    from public.attendance a join public.events e on e.id=a.event_id
    where a.member_id=mid and a.present=true
      and lower(coalesce(e.status,'published'))='published'
      and e.event_date is not null and e.event_date<=current_date
      and (e.publish_at is null or e.publish_at<=now())
    order by a.event_id,e.event_date desc nulls last,a.marked_at desc
    limit 20
  ) h;

  select coalesce(jsonb_agg(to_jsonb(u) order by u.event_date asc,lower(coalesce(u.title,'')) asc),'[]'::jsonb)
  into upcoming_rows
  from (
    select e.id as event_id,e.title,e.description,e.event_date,e.location,e.image_url,e.category,r.status as rsvp_status
    from public.events e
    left join public.event_rsvps r on r.event_id=e.id and r.member_id=mid
    where lower(coalesce(e.status,'published'))='published'
      and e.event_date is not null and e.event_date>=current_date
      and (e.publish_at is null or e.publish_at<=now())
    order by e.event_date asc,lower(coalesce(e.title,'')) asc limit 6
  ) u;

  select coalesce(jsonb_agg(feed.item order by feed.activity_at desc),'[]'::jsonb)
  into activity_rows
  from (
    select stream.item,stream.activity_at
    from (
      select jsonb_build_object('kind','attendance','title',case when a.present then 'Attendance marked: present' else 'Attendance marked: absent' end,'description',e.title,'status',case when a.present then 'present' else 'absent' end,'created_at',a.marked_at,'event_date',e.event_date) item,a.marked_at activity_at
      from public.attendance a join public.events e on e.id=a.event_id where a.member_id=mid
      union all
      select jsonb_build_object('kind','rsvp','title','Event RSVP updated','description',e.title,'status',r.status,'created_at',r.updated_at,'event_date',e.event_date),r.updated_at
      from public.event_rsvps r join public.events e on e.id=r.event_id where r.member_id=mid
      union all
      select jsonb_build_object('kind','notification','title',n.title,'description',n.body,'status',case when n.is_read then 'read' else 'unread' end,'created_at',n.created_at,'event_date',null),n.created_at
      from public.member_notifications n where n.member_id=mid
    ) stream
    order by stream.activity_at desc limit 8
  ) feed;

  return jsonb_build_object(
    'ok',true,
    'summary',jsonb_build_object(
      'events_attended',events_attended,
      'completed_events',completed_events,
      'recorded_events',recorded_events,
      'attendance_percentage',case when recorded_events>0 then round(events_attended::numeric*100/recorded_events,1) else null end,
      'upcoming_events',(select count(*)::int from public.events e where lower(coalesce(e.status,'published'))='published' and e.event_date is not null and e.event_date>=current_date and (e.publish_at is null or e.publish_at<=now())),
      'unread_notifications',(select count(*)::int from public.member_notifications n where n.member_id=mid and n.is_read=false)
    ),
    'attended_events',attended_rows,
    'attendance_history',history_rows,
    'upcoming_events',upcoming_rows,
    'activity',activity_rows,
    'generated_at',now()
  );
exception when others then
  return jsonb_build_object('ok',false,'error','Could not load member dashboard');
end
$function$;

CREATE OR REPLACE FUNCTION public.leader_dashboard_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  lid uuid;
  completed_events integer := 0;
  recorded_events integer := 0;
  events_attended integer := 0;
  history_rows jsonb;
  attended_rows jsonb;
  upcoming_rows jsonb;
  activity_rows jsonb;
begin
  lid := public._leader_id(p_token);
  if lid is null then return jsonb_build_object('ok',false,'error','Session expired'); end if;
  if not exists(select 1 from public.leaders l where l.id=lid and lower(coalesce(l.status,'active'))='active') then
    return jsonb_build_object('ok',false,'error','Active leader access required');
  end if;

  select count(*)::int into completed_events
  from public.events e
  where lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null and e.event_date<=current_date
    and (e.publish_at is null or e.publish_at<=now());

  select count(distinct a.event_id)::int into recorded_events
  from public.attendance a join public.events e on e.id=a.event_id
  where a.leader_id=lid
    and lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null and e.event_date<=current_date
    and (e.publish_at is null or e.publish_at<=now());

  select count(distinct a.event_id)::int into events_attended
  from public.attendance a join public.events e on e.id=a.event_id
  where a.leader_id=lid and a.present=true
    and lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null and e.event_date<=current_date
    and (e.publish_at is null or e.publish_at<=now());

  select coalesce(jsonb_agg(to_jsonb(h) order by h.event_date desc nulls last,h.marked_at desc),'[]'::jsonb)
  into history_rows
  from (
    select a.id,a.event_id,e.title as event_title,e.event_date,e.location,a.present,a.marked_at
    from public.attendance a join public.events e on e.id=a.event_id
    where a.leader_id=lid
    order by e.event_date desc nulls last,a.marked_at desc limit 12
  ) h;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.event_date desc nulls last,h.marked_at desc),'[]'::jsonb)
  into attended_rows
  from (
    select distinct on (a.event_id) a.id,a.event_id,e.title as event_title,e.event_date,e.location,a.present,a.marked_at
    from public.attendance a join public.events e on e.id=a.event_id
    where a.leader_id=lid and a.present=true
      and lower(coalesce(e.status,'published'))='published'
      and e.event_date is not null and e.event_date<=current_date
      and (e.publish_at is null or e.publish_at<=now())
    order by a.event_id,e.event_date desc nulls last,a.marked_at desc
    limit 20
  ) h;

  select coalesce(jsonb_agg(to_jsonb(u) order by u.event_date asc,lower(coalesce(u.title,'')) asc),'[]'::jsonb)
  into upcoming_rows
  from (
    select e.id as event_id,e.title,e.description,e.event_date,e.location,e.image_url,e.category
    from public.events e
    where lower(coalesce(e.status,'published'))='published'
      and e.event_date is not null and e.event_date>=current_date
      and (e.publish_at is null or e.publish_at<=now())
    order by e.event_date asc,lower(coalesce(e.title,'')) asc limit 6
  ) u;

  select coalesce(jsonb_agg(feed.item order by feed.activity_at desc),'[]'::jsonb)
  into activity_rows
  from (
    select stream.item,stream.activity_at
    from (
      select jsonb_build_object('kind','attendance','title',case when a.present then 'Attendance marked: present' else 'Attendance marked: absent' end,'description',e.title,'status',case when a.present then 'present' else 'absent' end,'created_at',a.marked_at,'event_date',e.event_date) item,a.marked_at activity_at
      from public.attendance a join public.events e on e.id=a.event_id where a.leader_id=lid
    ) stream
    order by stream.activity_at desc limit 8
  ) feed;

  return jsonb_build_object(
    'ok',true,
    'summary',jsonb_build_object(
      'events_attended',events_attended,
      'completed_events',completed_events,
      'recorded_events',recorded_events,
      'attendance_percentage',case when recorded_events>0 then round(events_attended::numeric*100/recorded_events,1) else null end,
      'upcoming_events',(select count(*)::int from public.events e where lower(coalesce(e.status,'published'))='published' and e.event_date is not null and e.event_date>=current_date and (e.publish_at is null or e.publish_at<=now()))
    ),
    'attended_events',attended_rows,
    'attendance_history',history_rows,
    'upcoming_events',upcoming_rows,
    'activity',activity_rows,
    'generated_at',now()
  );
exception when others then
  return jsonb_build_object('ok',false,'error','Could not load leader dashboard');
end
$function$;

-- Private delivery rows are accessed through token-checked SECURITY DEFINER RPCs only.
REVOKE ALL PRIVILEGES ON TABLE public.admin_message_deliveries FROM anon, authenticated;
