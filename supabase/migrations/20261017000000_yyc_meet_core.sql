-- YYC Meet: scheduled rooms and minimal join/leave attendance records.
-- The website's bespoke token sessions remain the source of host permissions.
-- Raw tables are never exposed directly to anon/authenticated; all access goes through checked RPCs.

create table public.yyc_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  invite_code text not null unique check (invite_code ~ '^[A-F0-9]{16}$'),
  room_name text not null unique check (room_name ~ '^yyc-[a-f0-9]{32}$'),
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  visibility text not null default 'club' check (visibility in ('club','invite')),
  waiting_room boolean not null default false,
  host_kind text not null check (host_kind in ('admin','leader','member')),
  host_id uuid,
  host_name text not null default 'YYC Host' check (char_length(host_name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index yyc_meetings_status_starts_idx on public.yyc_meetings (status, starts_at);
create index yyc_meetings_host_idx on public.yyc_meetings (host_kind, host_id);

create table public.yyc_meeting_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.yyc_meetings(id) on delete cascade,
  participant_key uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  user_kind text not null default 'guest' check (user_kind in ('admin','leader','member','guest')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, participant_key)
);
create index yyc_meeting_attendance_meeting_idx on public.yyc_meeting_attendance (meeting_id, joined_at);

alter table public.yyc_meetings enable row level security;
alter table public.yyc_meeting_attendance enable row level security;
revoke all on table public.yyc_meetings from anon, authenticated;
revoke all on table public.yyc_meeting_attendance from anon, authenticated;
grant all on table public.yyc_meetings to service_role;
grant all on table public.yyc_meeting_attendance to service_role;

create or replace function public.yyc_meet_portal(p_token text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_admin boolean := false;
  v_leader uuid;
  v_member uuid;
  v_role text;
  v_actor_id uuid;
  v_actor_name text;
  v_title text;
  v_description text;
  v_starts_at timestamptz;
  v_duration integer;
  v_visibility text;
  v_waiting boolean;
  v_id uuid;
  v_meeting public.yyc_meetings%rowtype;
  v_data jsonb;
  v_is_owner boolean;
begin
  v_admin := coalesce(public._admin_ok(p_token), false);
  v_leader := public._leader_id(p_token);
  v_member := public._member_id(p_token);
  if not v_admin and v_leader is null and v_member is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED',
      'message', 'Sign in with your YYC Member, Leader, or Admin account to manage meetings.');
  end if;

  if v_admin then
    v_role := 'admin'; v_actor_id := null; v_actor_name := 'YYC Admin';
  elsif v_leader is not null then
    v_role := 'leader'; v_actor_id := v_leader;
    select coalesce(nullif(btrim(name), ''), 'YYC Leader') into v_actor_name from public.leaders where id = v_leader;
    v_actor_name := coalesce(v_actor_name, 'YYC Leader');
  else
    v_role := 'member'; v_actor_id := v_member;
    select coalesce(nullif(btrim(name), ''), 'YYC Member') into v_actor_name from public.members where id = v_member;
    v_actor_name := coalesce(v_actor_name, 'YYC Member');
  end if;

  if p_action = 'me' then
    return jsonb_build_object('ok', true, 'actor', jsonb_build_object('kind', v_role, 'id', v_actor_id, 'name', v_actor_name));
  end if;

  if p_action = 'list' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at asc), '[]'::jsonb) into v_data
    from (
      select m.id, m.title, m.description, m.invite_code, m.starts_at, m.duration_minutes,
        m.status, m.visibility, m.waiting_room, m.host_kind, m.host_name, m.host_id,
        m.created_at, m.updated_at,
        (select count(*)::integer from public.yyc_meeting_attendance a where a.meeting_id = m.id) as attendee_count
      from public.yyc_meetings m
      where m.status <> 'cancelled'
        and (m.starts_at >= now() - interval '7 days' or m.status = 'live')
        and (m.visibility = 'club' or (m.host_kind = v_role and m.host_id is not distinct from v_actor_id) or v_admin)
      order by m.starts_at asc limit 100
    ) q;
    return jsonb_build_object('ok', true, 'meetings', v_data,
      'actor', jsonb_build_object('kind', v_role, 'id', v_actor_id, 'name', v_actor_name));
  end if;

  if p_action = 'create' then
    v_title := btrim(coalesce(p_payload->>'title', ''));
    v_description := left(btrim(coalesce(p_payload->>'description', '')), 2000);
    if char_length(v_title) < 3 or char_length(v_title) > 120 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_TITLE', 'message', 'Meeting title must be between 3 and 120 characters.');
    end if;
    begin
      v_starts_at := nullif(p_payload->>'starts_at', '')::timestamptz;
    exception when invalid_text_representation or datetime_field_overflow then
      return jsonb_build_object('ok', false, 'error', 'INVALID_TIME', 'message', 'Choose a valid date and time.');
    end;
    v_starts_at := coalesce(v_starts_at, now());
    if v_starts_at < now() - interval '10 minutes' or v_starts_at > now() + interval '2 years' then
      return jsonb_build_object('ok', false, 'error', 'INVALID_TIME', 'message', 'Meeting time must be within the next two years.');
    end if;
    begin
      v_duration := coalesce(nullif(p_payload->>'duration_minutes', '')::integer, 60);
    exception when invalid_text_representation then
      v_duration := 60;
    end;
    if v_duration < 15 or v_duration > 480 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_DURATION', 'message', 'Choose a duration from 15 minutes to 8 hours.');
    end if;
    v_visibility := case when p_payload->>'visibility' = 'invite' then 'invite' else 'club' end;
    v_waiting := lower(coalesce(p_payload->>'waiting_room', 'false')) = 'true';
    insert into public.yyc_meetings (title, description, invite_code, room_name, starts_at, duration_minutes, visibility, waiting_room, host_kind, host_id, host_name)
    values (v_title, v_description, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
      'yyc-' || replace(gen_random_uuid()::text, '-', ''), v_starts_at, v_duration, v_visibility, v_waiting, v_role, v_actor_id, v_actor_name)
    returning * into v_meeting;
    return jsonb_build_object('ok', true, 'meeting', jsonb_build_object(
      'id', v_meeting.id, 'title', v_meeting.title, 'description', v_meeting.description,
      'invite_code', v_meeting.invite_code, 'starts_at', v_meeting.starts_at,
      'duration_minutes', v_meeting.duration_minutes, 'status', v_meeting.status,
      'visibility', v_meeting.visibility, 'waiting_room', v_meeting.waiting_room,
      'host_kind', v_meeting.host_kind, 'host_name', v_meeting.host_name, 'created_at', v_meeting.created_at));
  end if;

  begin
    v_id := nullif(p_payload->>'id', '')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ID', 'message', 'This meeting link is invalid.');
  end;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'MISSING_ID', 'message', 'Select a meeting first.'); end if;
  select * into v_meeting from public.yyc_meetings where id = v_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND', 'message', 'Meeting not found.'); end if;
  v_is_owner := v_meeting.host_kind = v_role and v_meeting.host_id is not distinct from v_actor_id;
  if p_action in ('cancel', 'start', 'end', 'attendance') and not v_admin and not v_is_owner then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN', 'message', 'Only the meeting host or a YYC administrator can manage this meeting.');
  end if;

  if p_action = 'cancel' then
    if v_meeting.status = 'ended' then return jsonb_build_object('ok', false, 'error', 'ALREADY_ENDED', 'message', 'This meeting has already ended.'); end if;
    update public.yyc_meetings set status = 'cancelled', updated_at = now() where id = v_id returning * into v_meeting;
    return jsonb_build_object('ok', true, 'meeting', jsonb_build_object('id', v_meeting.id, 'status', v_meeting.status));
  elsif p_action = 'start' then
    if v_meeting.status in ('cancelled', 'ended') then return jsonb_build_object('ok', false, 'error', 'NOT_STARTABLE', 'message', 'This meeting cannot be started.'); end if;
    update public.yyc_meetings set status = 'live', updated_at = now() where id = v_id returning * into v_meeting;
    return jsonb_build_object('ok', true, 'meeting', jsonb_build_object('id', v_meeting.id, 'status', v_meeting.status));
  elsif p_action = 'end' then
    update public.yyc_meetings set status = 'ended', updated_at = now() where id = v_id returning * into v_meeting;
    return jsonb_build_object('ok', true, 'meeting', jsonb_build_object('id', v_meeting.id, 'status', v_meeting.status));
  elsif p_action = 'attendance' then
    select coalesce(jsonb_agg(jsonb_build_object('name', a.display_name, 'kind', a.user_kind, 'joined_at', a.joined_at, 'left_at', a.left_at,
      'duration_seconds', greatest(0, extract(epoch from (coalesce(a.left_at, a.last_seen_at) - a.joined_at))::integer) order by a.joined_at), '[]'::jsonb)
    into v_data from public.yyc_meeting_attendance a where a.meeting_id = v_id;
    return jsonb_build_object('ok', true, 'attendees', v_data);
  end if;
  return jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION', 'message', 'That meeting action is not supported.');
end;
$function$;

create or replace function public.yyc_meet_lookup(p_invite_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_code text;
  v_meeting public.yyc_meetings%rowtype;
begin
  v_code := upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-F0-9]', '', 'g'));
  if char_length(v_code) <> 16 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CODE', 'message', 'Enter the full 16-character YYC Meet code.');
  end if;
  select * into v_meeting from public.yyc_meetings where invite_code = v_code;
  if not found or v_meeting.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND', 'message', 'This meeting invite is invalid or has been cancelled.');
  end if;
  return jsonb_build_object('ok', true, 'meeting', jsonb_build_object(
    'id', v_meeting.id, 'title', v_meeting.title, 'description', v_meeting.description, 'invite_code', v_meeting.invite_code,
    'starts_at', v_meeting.starts_at, 'duration_minutes', v_meeting.duration_minutes, 'status', v_meeting.status,
    'visibility', v_meeting.visibility, 'waiting_room', v_meeting.waiting_room, 'host_name', v_meeting.host_name,
    'room_name', case when v_meeting.status in ('scheduled','live') then v_meeting.room_name else null end));
end;
$function$;

create or replace function public.yyc_meet_attendance(
  p_invite_code text, p_action text, p_participant_key uuid, p_display_name text, p_token text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_code text;
  v_meeting public.yyc_meetings%rowtype;
  v_role text := 'guest';
  v_name text;
  v_admin boolean := false;
  v_leader uuid;
  v_member uuid;
begin
  v_code := upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-F0-9]', '', 'g'));
  if char_length(v_code) <> 16 or p_participant_key is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST', 'message', 'Meeting attendance data is invalid.');
  end if;
  select * into v_meeting from public.yyc_meetings where invite_code = v_code;
  if not found or v_meeting.status in ('cancelled','ended') then
    return jsonb_build_object('ok', false, 'error', 'MEETING_CLOSED', 'message', 'This meeting is no longer active.');
  end if;
  v_name := left(btrim(coalesce(p_display_name, 'Guest')), 80);
  if v_name = '' then v_name := 'Guest'; end if;
  v_admin := coalesce(public._admin_ok(p_token), false);
  v_leader := public._leader_id(p_token);
  v_member := public._member_id(p_token);
  if v_admin then v_role := 'admin'; elsif v_leader is not null then v_role := 'leader'; elsif v_member is not null then v_role := 'member'; end if;
  if p_action = 'join' then
    insert into public.yyc_meeting_attendance (meeting_id, participant_key, display_name, user_kind, joined_at, last_seen_at, left_at)
    values (v_meeting.id, p_participant_key, v_name, v_role, now(), now(), null)
    on conflict (meeting_id, participant_key) do update
      set display_name = excluded.display_name, user_kind = excluded.user_kind, joined_at = now(), last_seen_at = now(), left_at = null;
    return jsonb_build_object('ok', true);
  elsif p_action = 'leave' then
    update public.yyc_meeting_attendance set left_at = now(), last_seen_at = now()
      where meeting_id = v_meeting.id and participant_key = p_participant_key;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION', 'message', 'Unsupported attendance action.');
end;
$function$;

revoke all on function public.yyc_meet_portal(text, text, jsonb) from public;
revoke all on function public.yyc_meet_lookup(text) from public;
revoke all on function public.yyc_meet_attendance(text, text, uuid, text, text) from public;
grant execute on function public.yyc_meet_portal(text, text, jsonb) to anon, authenticated;
grant execute on function public.yyc_meet_lookup(text) to anon, authenticated;
grant execute on function public.yyc_meet_attendance(text, text, uuid, text, text) to anon, authenticated;
