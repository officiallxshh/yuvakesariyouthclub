create or replace function public.admin_attendance_stats(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  completed_count integer := 0;
  member_rows jsonb := '[]'::jsonb;
  leader_rows jsonb := '[]'::jsonb;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  select count(*)::int into completed_count
  from public.events e
  where lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null
    and e.event_date <= current_date;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',m.id,
        'name',m.name,
        'role_number',m.role_number,
        'position',coalesce(m.position,'MEMBER'),
        'present',coalesce(x.present_count,0),
        'total_events',completed_count,
        'percentage',case when completed_count>0 then round((coalesce(x.present_count,0)::numeric*100)/completed_count,2) else 0 end
      )
      order by
        case when completed_count>0 then round((coalesce(x.present_count,0)::numeric*100)/completed_count,2) else 0 end desc,
        lower(coalesce(m.name,''))
    ),
    '[]'::jsonb
  )
  into member_rows
  from public.members m
  left join (
    select a.member_id,count(*)::int as present_count
    from public.attendance a
    join public.events e on e.id=a.event_id
    where a.present=true
      and lower(coalesce(e.status,'published'))='published'
      and e.event_date is not null
      and e.event_date <= current_date
    group by a.member_id
  ) x on x.member_id=m.id
  where lower(coalesce(m.status,'pending'))='approved'
    and coalesce(m.approved,false)=true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',l.id,
        'name',l.name,
        'role_number',l.role_number,
        'role',coalesce(l.role,'LEADER'),
        'present',coalesce(x.present_count,0),
        'total_events',completed_count,
        'percentage',case when completed_count>0 then round((coalesce(x.present_count,0)::numeric*100)/completed_count,2) else 0 end
      )
      order by
        case when completed_count>0 then round((coalesce(x.present_count,0)::numeric*100)/completed_count,2) else 0 end desc,
        lower(coalesce(l.name,''))
    ),
    '[]'::jsonb
  )
  into leader_rows
  from public.leaders l
  left join (
    select a.leader_id,count(*)::int as present_count
    from public.attendance a
    join public.events e on e.id=a.event_id
    where a.present=true
      and lower(coalesce(e.status,'published'))='published'
      and e.event_date is not null
      and e.event_date <= current_date
    group by a.leader_id
  ) x on x.leader_id=l.id
  where lower(coalesce(l.status,'active')) <> 'inactive';

  return jsonb_build_object(
    'ok',true,
    'completed_events',completed_count,
    'members',member_rows,
    'leaders',leader_rows,
    'generated_at',now()
  );
exception when others then
  return jsonb_build_object('ok',false,'error','Unable to calculate attendance percentages');
end
$function$;

grant execute on function public.admin_attendance_stats(text) to anon, authenticated;