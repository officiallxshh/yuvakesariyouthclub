create or replace function public.admin_feature_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  return jsonb_build_object(
    'ok',true,
    'settings',(select to_jsonb(s) from public.site_settings s where s.id=true),
    'achievements',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order,a.achieved_on desc nulls last,a.created_at desc) from public.achievements a),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.sort_order,h.year_label,h.created_at) from public.club_history h),'[]'::jsonb),
    'volunteers',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'phone',v.phone,'email',v.email,'area',v.area,'skills',v.skills,'availability',v.availability,'message',v.message,'approved',v.approved,'status',v.status,'source',v.source,'created_at',v.created_at,'updated_at',v.updated_at) order by v.created_at desc) from public.volunteers v),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'subject',c.subject,'message',c.message,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at) order by c.created_at desc) from public.contact_messages c),'[]'::jsonb),
    'finance',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'entry_date',f.entry_date,'description',f.description,'amount',f.amount,'entry_type',f.entry_type,'created_at',f.created_at) order by f.entry_date desc,f.created_at desc) from public.finance f),'[]'::jsonb),
    'attendance',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'member_id',at.member_id,'leader_id',at.leader_id,'event_id',at.event_id,'present',at.present,'marked_at',at.marked_at) order by at.marked_at desc) from public.attendance at limit 500),'[]'::jsonb)
  );
end
$function$;