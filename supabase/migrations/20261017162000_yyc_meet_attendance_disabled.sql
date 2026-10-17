-- Disable YYC Meet attendance collection/reporting.
-- Keep the legacy attendance table and historical records intact. The Meet UI no longer
-- displays reports or writes attendance, and these server RPCs no longer collect/report it.
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

  if p_action = 'attendance' then
    return jsonb_build_object('ok', false, 'error', 'FEATURE_DISABLED', 'message', 'Meeting attendance is disabled.');
  end if;

  if p_action = 'list' and not v_admin then
    return jsonb_build_object('ok', true, 'meetings', '[]'::jsonb,
      'actor', jsonb_build_object('kind', v_role, 'id', v_actor_id, 'name', v_actor_name));
  end if;

  if p_action = 'list' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at asc), '[]'::jsonb) into v_data
    from (
      select m.id, m.title, m.description, m.invite_code, m.starts_at, m.duration_minutes,
        m.status, m.visibility, m.waiting_room, m.host_kind, m.host_name, m.host_id,
        m.created_at, m.updated_at
      from public.yyc_meetings m
      where m.status <> 'cancelled'
        and (m.starts_at >= now() - interval '7 days' or m.status = 'live')
        and (m.visibility = 'club' or (m.host_kind = v_role and m.host_id is not distinct from v_actor_id) or v_admin)
      order by m.starts_at asc limit 100
    ) q;
    return jsonb_build_object('ok', true, 'meetings', v_data,
      'actor', jsonb_build_object('kind', v_role, 'id', v_actor_id, 'name', v_actor_name));
  end if;

  if p_action in ('create', 'start', 'end', 'cancel') and not v_admin then
    return jsonb_build_object('ok', false, 'error', 'ADMIN_REQUIRED',
      'message', 'Only a YYC Admin can create, start, end, or cancel meetings.');
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
    v_visibility := 'invite';
    v_waiting := lower(coalesce(p_payload->>'waiting_room', 'false')) = 'true';
    insert into public.yyc_meetings (title, description, invite_code, room_name, starts_at, duration_minutes, visibility, waiting_room, host_kind, host_id, host_name)
    values (v_title, v_description, upper(replace(gen_random_uuid()::text, '-', '')),
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
  if p_action in ('cancel', 'start', 'end') and not v_admin and not v_is_owner then
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
  end if;
  return jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION', 'message', 'That meeting action is not supported.');
end;
$function$;


create or replace function public.yyc_meet_attendance(
  p_invite_code text, p_action text, p_participant_key uuid, p_display_name text, p_token text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  return jsonb_build_object('ok', false, 'error', 'FEATURE_DISABLED', 'message', 'Meeting attendance is disabled.');
end;
$function$;


-- Preserve the existing execute grants for compatibility; the RPC body now returns FEATURE_DISABLED.
