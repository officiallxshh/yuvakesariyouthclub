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
  if not found or (v_meeting.status in ('cancelled','ended') and p_action <> 'leave') then
    return jsonb_build_object('ok', false, 'error', 'MEETING_CLOSED', 'message', 'This meeting is no longer active.');
  end if;

  v_name := left(btrim(coalesce(p_display_name, 'Guest')), 80);
  if v_name = '' then v_name := 'Guest'; end if;
  v_admin := coalesce(public._admin_ok(p_token), false);
  v_leader := public._leader_id(p_token);
  v_member := public._member_id(p_token);
  if v_admin then v_role := 'admin';
  elsif v_leader is not null then v_role := 'leader';
  elsif v_member is not null then v_role := 'member';
  end if;

  if p_action = 'join' then
    insert into public.yyc_meeting_attendance (
      meeting_id, participant_key, display_name, user_kind, joined_at, last_seen_at, left_at
    ) values (
      v_meeting.id, p_participant_key, v_name, v_role, now(), now(), null
    )
    on conflict (meeting_id, participant_key) do update
      set display_name = excluded.display_name, user_kind = excluded.user_kind,
          joined_at = now(), last_seen_at = now(), left_at = null;
    return jsonb_build_object('ok', true);
  elsif p_action = 'leave' then
    update public.yyc_meeting_attendance
      set left_at = now(), last_seen_at = now()
      where meeting_id = v_meeting.id and participant_key = p_participant_key;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION', 'message', 'Unsupported attendance action.');
end;
$function$;

revoke all on function public.yyc_meet_attendance(text, text, uuid, text, text) from public;
grant execute on function public.yyc_meet_attendance(text, text, uuid, text, text) to anon, authenticated;