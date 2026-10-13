-- YYC Build 17: persistent volunteer tasks with strict token-scoped access.
-- This migration is additive. Existing membership, event, media and login flows remain unchanged.

create table if not exists public.yyc_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 140),
  description text not null default '' check (char_length(description) <= 3000),
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_leader_id uuid references public.leaders(id) on delete set null,
  related_event_id uuid references public.events(id) on delete set null,
  due_date date,
  created_by text not null default 'Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz
);

create index if not exists yyc_tasks_active_due_idx
  on public.yyc_tasks (is_archived, due_date, status);
create index if not exists yyc_tasks_assigned_idx
  on public.yyc_tasks (assigned_leader_id, is_archived, due_date);

create table if not exists public.yyc_task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.yyc_tasks(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('admin','leader')),
  actor_id uuid,
  actor_label text not null default '',
  old_status text,
  new_status text,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists yyc_task_updates_task_created_idx
  on public.yyc_task_updates (task_id, created_at desc);

alter table public.yyc_tasks enable row level security;
alter table public.yyc_task_updates enable row level security;
revoke all on table public.yyc_tasks from anon, authenticated;
revoke all on table public.yyc_task_updates from anon, authenticated;

create or replace function public.admin_tasks_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  return jsonb_build_object(
    'ok',true,
    'tasks',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',t.id,
          'title',t.title,
          'description',t.description,
          'status',t.status,
          'priority',t.priority,
          'assigned_leader_id',t.assigned_leader_id,
          'assigned_leader_name',l.name,
          'related_event_id',t.related_event_id,
          'event_title',e.title,
          'due_date',t.due_date,
          'created_by',t.created_by,
          'created_at',t.created_at,
          'updated_at',t.updated_at,
          'completed_at',t.completed_at,
          'is_archived',t.is_archived,
          'archived_at',t.archived_at,
          'updates',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',u.id,'actor_kind',u.actor_kind,'actor_label',u.actor_label,
              'old_status',u.old_status,'new_status',u.new_status,
              'note',u.note,'created_at',u.created_at
            ) order by u.created_at desc)
            from public.yyc_task_updates u where u.task_id=t.id
          ),'[]'::jsonb)
        ) order by t.is_archived, t.due_date nulls last, t.created_at desc
      )
      from public.yyc_tasks t
      left join public.leaders l on l.id=t.assigned_leader_id
      left join public.events e on e.id=t.related_event_id
    ),'[]'::jsonb)
  );
end
$function$;

create or replace function public.admin_task_upsert(p_token text, p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_payload->>'title',''));
  v_description text := coalesce(p_payload->>'description','');
  v_status text := coalesce(nullif(p_payload->>'status',''),'todo');
  v_priority text := coalesce(nullif(p_payload->>'priority',''),'normal');
  v_leader uuid := nullif(p_payload->>'assigned_leader_id','')::uuid;
  v_event uuid := nullif(p_payload->>'related_event_id','')::uuid;
  v_due date := nullif(p_payload->>'due_date','')::date;
  v_actor text;
  v_old_status text;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;
  if char_length(v_title)<3 or char_length(v_title)>140 then
    return jsonb_build_object('ok',false,'error','Task title must be between 3 and 140 characters');
  end if;
  if char_length(v_description)>3000 then
    return jsonb_build_object('ok',false,'error','Task description must be 3000 characters or fewer');
  end if;
  if v_status not in ('todo','in_progress','blocked','completed','cancelled') then
    return jsonb_build_object('ok',false,'error','Invalid task status');
  end if;
  if v_priority not in ('low','normal','high','urgent') then
    return jsonb_build_object('ok',false,'error','Invalid task priority');
  end if;
  if v_leader is not null and not exists (
    select 1 from public.leaders where id=v_leader and coalesce(status,'active')='active'
  ) then
    return jsonb_build_object('ok',false,'error','Choose an active YYC leader');
  end if;
  if v_event is not null and not exists(select 1 from public.events where id=v_event) then
    return jsonb_build_object('ok',false,'error','The selected event no longer exists');
  end if;

  select s.username into v_actor
  from public.admin_sessions s
  where s.token_hash=public._hash_token(p_token)
  order by s.created_at desc limit 1;
  v_actor := coalesce(v_actor,'Admin');

  if p_id is null then
    insert into public.yyc_tasks(title,description,status,priority,assigned_leader_id,related_event_id,due_date,created_by,completed_at)
    values(v_title,v_description,v_status,v_priority,v_leader,v_event,v_due,v_actor,
      case when v_status='completed' then now() else null end)
    returning id into v_id;

    insert into public.yyc_task_updates(task_id,actor_kind,actor_label,old_status,new_status,note)
    values(v_id,'admin',v_actor,null,v_status,'Task created');
  else
    select status into v_old_status from public.yyc_tasks where id=p_id;
    if not found then return jsonb_build_object('ok',false,'error','Task not found'); end if;

    update public.yyc_tasks
      set title=v_title, description=v_description, status=v_status, priority=v_priority,
          assigned_leader_id=v_leader, related_event_id=v_event, due_date=v_due,
          updated_at=now(), completed_at=case when v_status='completed' then coalesce(completed_at,now()) else null end
      where id=p_id
      returning id into v_id;

    insert into public.yyc_task_updates(task_id,actor_kind,actor_label,old_status,new_status,note)
    values(v_id,'admin',v_actor,v_old_status,v_status,
      case when v_old_status is distinct from v_status then 'Task details/status updated' else 'Task details updated' end);
  end if;

  insert into public.admin_activity_log(actor_username,action,entity_type,entity_id,summary)
  values(v_actor,case when p_id is null then 'create' else 'update' end,'task',v_id,left(v_title,180));

  return jsonb_build_object('ok',true,'id',v_id);
exception
  when invalid_text_representation or datetime_field_overflow then
    return jsonb_build_object('ok',false,'error','Invalid leader, event or due-date value');
end
$function$;

create or replace function public.admin_task_archive(p_token text, p_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_actor text;
  v_title text;
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok',false,'error','Unauthorized');
  end if;

  select title into v_title from public.yyc_tasks where id=p_id;
  if not found then return jsonb_build_object('ok',false,'error','Task not found'); end if;

  select s.username into v_actor
  from public.admin_sessions s
  where s.token_hash=public._hash_token(p_token)
  order by s.created_at desc limit 1;
  v_actor := coalesce(v_actor,'Admin');

  update public.yyc_tasks
  set is_archived=coalesce(p_archived,false),
      archived_at=case when coalesce(p_archived,false) then now() else null end,
      updated_at=now()
  where id=p_id;

  insert into public.admin_activity_log(actor_username,action,entity_type,entity_id,summary)
  values(v_actor,case when coalesce(p_archived,false) then 'archive' else 'restore' end,'task',p_id,left(v_title,180));

  return jsonb_build_object('ok',true,'archived',coalesce(p_archived,false));
end
$function$;

create or replace function public.leader_tasks_list(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_leader uuid;
begin
  v_leader := public._leader_id(p_token);
  if v_leader is null then
    return jsonb_build_object('ok',false,'error','Leader session expired. Please log in again.');
  end if;

  return jsonb_build_object(
    'ok',true,
    'tasks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'title',t.title,'description',t.description,
        'status',t.status,'priority',t.priority,'due_date',t.due_date,
        'event_title',e.title,'updated_at',t.updated_at,'completed_at',t.completed_at
      ) order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
                 t.due_date nulls last, t.created_at desc)
      from public.yyc_tasks t
      left join public.events e on e.id=t.related_event_id
      where t.assigned_leader_id=v_leader and not t.is_archived
        and t.status <> 'cancelled'
    ),'[]'::jsonb)
  );
end
$function$;

create or replace function public.leader_task_update(p_token text, p_id uuid, p_status text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_leader uuid;
  v_name text;
  v_old text;
  v_title text;
  v_note text := trim(coalesce(p_note,''));
begin
  v_leader := public._leader_id(p_token);
  if v_leader is null then
    return jsonb_build_object('ok',false,'error','Leader session expired. Please log in again.');
  end if;
  if p_status not in ('todo','in_progress','blocked','completed') then
    return jsonb_build_object('ok',false,'error','Invalid task status');
  end if;
  if char_length(v_note)>1000 then
    return jsonb_build_object('ok',false,'error','Update note must be 1000 characters or fewer');
  end if;

  select t.status,t.title,l.name into v_old,v_title,v_name
  from public.yyc_tasks t join public.leaders l on l.id=t.assigned_leader_id
  where t.id=p_id and t.assigned_leader_id=v_leader and not t.is_archived;
  if not found then
    return jsonb_build_object('ok',false,'error','This task is not assigned to your account');
  end if;

  update public.yyc_tasks
  set status=p_status,updated_at=now(),
      completed_at=case when p_status='completed' then now() else null end
  where id=p_id and assigned_leader_id=v_leader and not is_archived;

  insert into public.yyc_task_updates(task_id,actor_kind,actor_id,actor_label,old_status,new_status,note)
  values(p_id,'leader',v_leader,coalesce(v_name,'Leader'),v_old,p_status,v_note);

  return jsonb_build_object('ok',true,'id',p_id,'status',p_status);
end
$function$;

revoke all on function public.admin_tasks_list(text) from public;
revoke all on function public.admin_task_upsert(text,uuid,jsonb) from public;
revoke all on function public.admin_task_archive(text,uuid,boolean) from public;
revoke all on function public.leader_tasks_list(text) from public;
revoke all on function public.leader_task_update(text,uuid,text,text) from public;
grant execute on function public.admin_tasks_list(text) to anon, authenticated;
grant execute on function public.admin_task_upsert(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.admin_task_archive(text,uuid,boolean) to anon, authenticated;
grant execute on function public.leader_tasks_list(text) to anon, authenticated;
grant execute on function public.leader_task_update(text,uuid,text,text) to anon, authenticated;

-- Keep the automated, manual and downloaded application-level backups complete for this module.
create or replace function private.yyc_build_backup_snapshot()
returns jsonb
language sql
security definer
set search_path to 'public','storage','pg_temp'
as $function$
  select jsonb_build_object(
    'backup_format_version', 3,
    'backup_scope', 'yyc_business_data_and_audit',
    'generated_at', clock_timestamp(),
    'settings', (select to_jsonb(s) from public.site_settings s where s.id = true),
    'admin_accounts', coalesce((select jsonb_agg(to_jsonb(au) - 'password_hash' order by au.created_at, au.id) from public.admin_users au), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(m) - 'password_hash' order by m.created_at, m.id) from public.members m), '[]'::jsonb),
    'leaders', coalesce((select jsonb_agg(to_jsonb(l) - 'password_hash' order by l.created_at, l.id) from public.leaders l), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.published_at, a.id) from public.announcements a), '[]'::jsonb),
    'news', coalesce((select jsonb_agg(to_jsonb(n) order by n.published_at, n.id) from public.news n), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.event_date nulls last, e.created_at, e.id) from public.events e), '[]'::jsonb),
    'gallery', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at, g.id) from public.gallery g), '[]'::jsonb),
    'swags', coalesce((select jsonb_agg(to_jsonb(sw) order by sw.sort_order, sw.created_at, sw.id) from public.swags sw), '[]'::jsonb),
    'volunteers', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at, v.id) from public.volunteers v), '[]'::jsonb),
    'achievements', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.created_at, a.id) from public.achievements a), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.sort_order, h.year_label, h.created_at) from public.club_history h), '[]'::jsonb),
    'finance', coalesce((select jsonb_agg(to_jsonb(f) order by f.entry_date, f.created_at, f.id) from public.finance f), '[]'::jsonb),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at, c.id) from public.contact_messages c), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(at) order by at.marked_at, at.id) from public.attendance at), '[]'::jsonb),
    'member_cards', coalesce((select jsonb_agg(to_jsonb(mc) order by mc.issued_at nulls last, mc.updated_at, mc.id) from public.member_cards mc), '[]'::jsonb),
    'event_rsvps', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id) from public.event_rsvps r), '[]'::jsonb),
    'member_notifications', coalesce((select jsonb_agg(to_jsonb(mn) order by mn.created_at, mn.id) from public.member_notifications mn), '[]'::jsonb),
    'admin_activity_log', coalesce((select jsonb_agg(to_jsonb(al) order by al.created_at, al.id) from public.admin_activity_log al), '[]'::jsonb),
    'admin_message_deliveries', coalesce((select jsonb_agg(to_jsonb(md) order by md.created_at, md.id) from public.admin_message_deliveries md), '[]'::jsonb),
    'admin_message_delivery_events', coalesce((select jsonb_agg(to_jsonb(me) order by me.received_at, me.id) from public.admin_message_delivery_events me), '[]'::jsonb),
    'yyc_tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.yyc_tasks t), '[]'::jsonb),
    'yyc_task_updates', coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at, u.id) from public.yyc_task_updates u), '[]'::jsonb),
    'storage_objects_manifest', coalesce((
      select jsonb_agg(jsonb_build_object('bucket_id',o.bucket_id,'name',o.name,'created_at',o.created_at,'updated_at',o.updated_at,'metadata',o.metadata) order by o.bucket_id,o.name)
      from storage.objects o where o.bucket_id in ('member-photos','yyc-media','yyc-certificates')
    ), '[]'::jsonb),
    'table_counts', jsonb_build_object(
      'admin_accounts',(select count(*) from public.admin_users),
      'members',(select count(*) from public.members),
      'leaders',(select count(*) from public.leaders),
      'announcements',(select count(*) from public.announcements),
      'news',(select count(*) from public.news),
      'events',(select count(*) from public.events),
      'gallery',(select count(*) from public.gallery),
      'swags',(select count(*) from public.swags),
      'volunteers',(select count(*) from public.volunteers),
      'achievements',(select count(*) from public.achievements),
      'club_history',(select count(*) from public.club_history),
      'finance',(select count(*) from public.finance),
      'contact_messages',(select count(*) from public.contact_messages),
      'attendance',(select count(*) from public.attendance),
      'member_cards',(select count(*) from public.member_cards),
      'event_rsvps',(select count(*) from public.event_rsvps),
      'member_notifications',(select count(*) from public.member_notifications),
      'admin_activity_log',(select count(*) from public.admin_activity_log),
      'admin_message_deliveries',(select count(*) from public.admin_message_deliveries),
      'admin_message_delivery_events',(select count(*) from public.admin_message_delivery_events),
      'yyc_tasks',(select count(*) from public.yyc_tasks),
      'yyc_task_updates',(select count(*) from public.yyc_task_updates),
      'storage_objects',(select count(*) from storage.objects where bucket_id in ('member-photos','yyc-media','yyc-certificates'))
    ),
    'excluded_sensitive_data','Password hashes, active session tokens, and login-attempt throttling state are intentionally excluded from application-level snapshots.'
  );
$function$;

revoke all on function private.yyc_build_backup_snapshot() from public, anon, authenticated;
