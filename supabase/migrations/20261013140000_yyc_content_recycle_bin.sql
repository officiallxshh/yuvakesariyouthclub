-- YYC Build 17: recoverable deletion for public content and event-linked records.
-- Member/leader account deletion and Reel file deletion are intentionally not routed through this bin.

create table if not exists public.yyc_recycle_bin (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('update','gallery','event','swag','achievement','history')),
  entity_id uuid not null,
  entity_title text not null default 'Deleted content',
  payload jsonb not null,
  deleted_by text not null default 'Admin',
  deleted_at timestamptz not null default now(),
  restored_by text,
  restored_at timestamptz,
  purged_by text,
  purged_at timestamptz
);
create index if not exists yyc_recycle_bin_active_idx
  on public.yyc_recycle_bin (deleted_at desc) where restored_at is null and purged_at is null;
alter table public.yyc_recycle_bin enable row level security;
revoke all on table public.yyc_recycle_bin from anon, authenticated;

create or replace function private.yyc_recycle_store(
  p_token text, p_type text, p_id uuid, p_title text, p_payload jsonb
) returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare v_actor text;
begin
  if not public._admin_ok(p_token) then
    raise exception 'Unauthorized';
  end if;
  if p_type not in ('update','gallery','event','swag','achievement','history') then
    raise exception 'Unsupported recycle-bin type';
  end if;
  select s.username into v_actor
  from public.admin_sessions s where s.token_hash=public._hash_token(p_token)
  order by s.created_at desc limit 1;
  insert into public.yyc_recycle_bin(entity_type,entity_id,entity_title,payload,deleted_by)
  values(p_type,p_id,left(coalesce(nullif(trim(p_title),''),'Deleted content'),180),p_payload,coalesce(v_actor,'Admin'));
end
$function$;
revoke all on function private.yyc_recycle_store(text,text,uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.admin_delete_content(p_token text, p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  titlev text;
  payloadv jsonb;
  kindv text := lower(trim(coalesce(p_kind,'')));
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  if kindv='update' then
    select to_jsonb(a),a.title into payloadv,titlev from public.announcements a where a.id=p_id;
    if not found then return jsonb_build_object('ok',false,'error','Record not found'); end if;
    perform private.yyc_recycle_store(p_token,kindv,p_id,titlev,jsonb_build_object('record',payloadv));
    delete from public.announcements where id=p_id;
  elsif kindv='gallery' then
    select to_jsonb(g),g.title into payloadv,titlev from public.gallery g where g.id=p_id;
    if not found then return jsonb_build_object('ok',false,'error','Record not found'); end if;
    perform private.yyc_recycle_store(p_token,kindv,p_id,titlev,jsonb_build_object('record',payloadv));
    delete from public.gallery where id=p_id;
  else
    return jsonb_build_object('ok',false,'error','Unknown content kind');
  end if;
  perform public.admin_log_activity(p_token,'deleted_to_recycle_bin',kindv,p_id,coalesce(titlev,'Content'));
  return jsonb_build_object('ok',true,'recoverable',true);
end
$function$;

create or replace function public.admin_delete_event(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  e public.events;
  payloadv jsonb;
  v_actor text;
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  select * into e from public.events where id=p_id;
  if not found then return jsonb_build_object('ok',false,'error','Event not found'); end if;
  payloadv:=jsonb_build_object(
    'record',to_jsonb(e),
    'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.marked_at,a.id) from public.attendance a where a.event_id=p_id),'[]'::jsonb),
    'event_rsvps',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from public.event_rsvps r where r.event_id=p_id),'[]'::jsonb),
    'related_task_ids',coalesce((select jsonb_agg(t.id) from public.yyc_tasks t where t.related_event_id=p_id),'[]'::jsonb)
  );
  perform private.yyc_recycle_store(p_token,'event',p_id,e.title,payloadv);
  delete from public.events where id=p_id;
  select s.username into v_actor from public.admin_sessions s
  where s.token_hash=public._hash_token(p_token) order by s.created_at desc limit 1;
  perform public.admin_log_activity(p_token,'deleted_to_recycle_bin','event',p_id,coalesce(e.title,'Event'));
  return jsonb_build_object('ok',true,'recoverable',true);
end
$function$;

create or replace function public.admin_delete_swag(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare v public.swags;
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  select * into v from public.swags where id=p_id;
  if not found then return jsonb_build_object('ok',false,'error','Swag item not found'); end if;
  perform private.yyc_recycle_store(p_token,'swag',p_id,v.title,jsonb_build_object('record',to_jsonb(v)));
  delete from public.swags where id=p_id;
  perform public.admin_log_activity(p_token,'deleted_to_recycle_bin','swag',p_id,v.title);
  return jsonb_build_object('ok',true,'recoverable',true);
end
$function$;

create or replace function public.admin_delete_achievement(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare v public.achievements;
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  select * into v from public.achievements where id=p_id;
  if not found then return jsonb_build_object('ok',false,'error','Achievement not found'); end if;
  perform private.yyc_recycle_store(p_token,'achievement',p_id,v.title,jsonb_build_object('record',to_jsonb(v)));
  delete from public.achievements where id=p_id;
  perform public.admin_log_activity(p_token,'deleted_to_recycle_bin','achievement',p_id,v.title);
  return jsonb_build_object('ok',true,'recoverable',true);
end
$function$;

create or replace function public.admin_delete_history(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare v public.club_history;
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  select * into v from public.club_history where id=p_id;
  if not found then return jsonb_build_object('ok',false,'error','History item not found'); end if;
  perform private.yyc_recycle_store(p_token,'history',p_id,v.title,jsonb_build_object('record',to_jsonb(v)));
  delete from public.club_history where id=p_id;
  perform public.admin_log_activity(p_token,'deleted_to_recycle_bin','history',p_id,v.title);
  return jsonb_build_object('ok',true,'recoverable',true);
end
$function$;

create or replace function public.admin_recycle_bin_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  return jsonb_build_object('ok',true,'items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'entity_type',r.entity_type,'entity_id',r.entity_id,'entity_title',r.entity_title,
      'deleted_by',r.deleted_by,'deleted_at',r.deleted_at
    ) order by r.deleted_at desc)
    from public.yyc_recycle_bin r
    where r.restored_at is null and r.purged_at is null
  ),'[]'::jsonb));
end
$function$;

create or replace function public.admin_recycle_restore(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v public.yyc_recycle_bin;
  rec jsonb;
  item jsonb;
  v_actor text;
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  select * into v from public.yyc_recycle_bin
    where id=p_id and restored_at is null and purged_at is null for update;
  if not found then return jsonb_build_object('ok',false,'error','Recycle-bin item not found or no longer available'); end if;
  rec:=v.payload->'record';

  if v.entity_type='update' then
    if exists(select 1 from public.announcements where id=v.entity_id) then return jsonb_build_object('ok',false,'error','An update with this ID already exists'); end if;
    insert into public.announcements select (jsonb_populate_record(null::public.announcements,rec)).*;
  elsif v.entity_type='gallery' then
    if exists(select 1 from public.gallery where id=v.entity_id) then return jsonb_build_object('ok',false,'error','A gallery item with this ID already exists'); end if;
    insert into public.gallery select (jsonb_populate_record(null::public.gallery,rec)).*;
  elsif v.entity_type='event' then
    if exists(select 1 from public.events where id=v.entity_id) then return jsonb_build_object('ok',false,'error','An event with this ID already exists'); end if;
    insert into public.events select (jsonb_populate_record(null::public.events,rec)).*;
    for item in select value from jsonb_array_elements(coalesce(v.payload->'attendance','[]'::jsonb))
    loop
      insert into public.attendance select (jsonb_populate_record(null::public.attendance,item)).*
      on conflict (id) do nothing;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(v.payload->'event_rsvps','[]'::jsonb))
    loop
      insert into public.event_rsvps select (jsonb_populate_record(null::public.event_rsvps,item)).*
      on conflict (id) do nothing;
    end loop;
    update public.yyc_tasks t set related_event_id=v.entity_id,updated_at=now()
      where t.id in (select value::text::uuid from jsonb_array_elements_text(coalesce(v.payload->'related_task_ids','[]'::jsonb)))
        and t.related_event_id is null;
  elsif v.entity_type='swag' then
    if exists(select 1 from public.swags where id=v.entity_id) then return jsonb_build_object('ok',false,'error','A swag item with this ID already exists'); end if;
    insert into public.swags select (jsonb_populate_record(null::public.swags,rec)).*;
  elsif v.entity_type='achievement' then
    if exists(select 1 from public.achievements where id=v.entity_id) then return jsonb_build_object('ok',false,'error','An achievement with this ID already exists'); end if;
    insert into public.achievements select (jsonb_populate_record(null::public.achievements,rec)).*;
  elsif v.entity_type='history' then
    if exists(select 1 from public.club_history where id=v.entity_id) then return jsonb_build_object('ok',false,'error','A history item with this ID already exists'); end if;
    insert into public.club_history select (jsonb_populate_record(null::public.club_history,rec)).*;
  else
    return jsonb_build_object('ok',false,'error','Unsupported recycle-bin item type');
  end if;

  select s.username into v_actor from public.admin_sessions s
    where s.token_hash=public._hash_token(p_token) order by s.created_at desc limit 1;
  update public.yyc_recycle_bin set restored_at=now(),restored_by=coalesce(v_actor,'Admin') where id=p_id;
  perform public.admin_log_activity(p_token,'restored',v.entity_type,v.entity_id,v.entity_title);
  return jsonb_build_object('ok',true,'entity_type',v.entity_type,'entity_id',v.entity_id);
exception
  when unique_violation then return jsonb_build_object('ok',false,'error','A record with this ID already exists; nothing was restored');
end
$function$;

create or replace function public.admin_recycle_purge(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v public.yyc_recycle_bin; v_actor text;
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  select * into v from public.yyc_recycle_bin
    where id=p_id and restored_at is null and purged_at is null for update;
  if not found then return jsonb_build_object('ok',false,'error','Recycle-bin item not found or already handled'); end if;
  select s.username into v_actor from public.admin_sessions s
    where s.token_hash=public._hash_token(p_token) order by s.created_at desc limit 1;
  update public.yyc_recycle_bin set payload='{}'::jsonb,purged_at=now(),purged_by=coalesce(v_actor,'Admin') where id=p_id;
  perform public.admin_log_activity(p_token,'permanently_purged',v.entity_type,v.entity_id,v.entity_title);
  return jsonb_build_object('ok',true,'permanently_deleted',true);
end
$function$;

revoke all on function public.admin_recycle_bin_list(text) from public;
revoke all on function public.admin_recycle_restore(text,uuid) from public;
revoke all on function public.admin_recycle_purge(text,uuid) from public;
grant execute on function public.admin_recycle_bin_list(text) to anon,authenticated;
grant execute on function public.admin_recycle_restore(text,uuid) to anon,authenticated;
grant execute on function public.admin_recycle_purge(text,uuid) to anon,authenticated;

-- Wrap the existing complete backup and add recoverable items without dropping its other fields.
alter function private.yyc_build_backup_snapshot() rename to yyc_build_backup_snapshot_base;
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
  v:=jsonb_set(v,'{table_counts}',coalesce(v->'table_counts','{}'::jsonb)||
    jsonb_build_object('yyc_recycle_bin',(select count(*) from public.yyc_recycle_bin)),true);
  return v;
end
$function$;
revoke all on function private.yyc_build_backup_snapshot() from public,anon,authenticated;
