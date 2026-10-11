-- Admin-only manual ordering for approved members.
-- Role numbers remain compact and unique; QR codes continue to encode the stable member UUID,
-- so existing QR scans resolve the member's latest role number through public_verify_identity.

CREATE OR REPLACE FUNCTION public.admin_member_order_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  lid uuid;
  leader_name text;
  member_rows jsonb;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin session expired');
  END IF;
  leader_name := 'YYC Admin';

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'position', coalesce(m.position, 'MEMBER'),
        'role_number', m.role_number,
        'photo_url', CASE
          WHEN left(coalesce(m.photo_url, ''), 11) = 'data:image/' THEN ''
          ELSE coalesce(m.photo_url, '')
        END
      )
      ORDER BY substring(m.role_number from '[0-9]+$')::bigint,
               m.approved_at ASC NULLS LAST,
               m.created_at ASC,
               m.id ASC
    ),
    '[]'::jsonb
  )
  INTO member_rows
  FROM public.members m
  WHERE m.approved = true
    AND m.status = 'approved'
    AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$';

  RETURN jsonb_build_object('ok', true, 'members', member_rows);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'Could not load the approved member order');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reorder_member(
  p_token text,
  p_member_id uuid,
  p_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  lid uuid;
  leader_name text;
  member_ids uuid[];
  target_index integer;
  swap_index integer;
  swap_id uuid;
  active_count integer;
  eligible_count integer;
  active_year text;
  i integer;
  old_role text;
  new_role text;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin session expired');
  END IF;
  leader_name := 'YYC Admin';

  IF lower(trim(coalesce(p_direction, ''))) NOT IN ('up', 'down') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose up or down');
  END IF;

  -- Share the same lock used by approvals/removals so numbering cannot race.
  PERFORM pg_advisory_xact_lock(hashtext('yyc-active-member-roll-sequence')::bigint);

  SELECT count(*) INTO active_count
  FROM public.members m
  WHERE m.approved = true AND m.status = 'approved';

  SELECT count(*) INTO eligible_count
  FROM public.members m
  WHERE m.approved = true AND m.status = 'approved'
    AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$';

  IF active_count <> eligible_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Some approved members have a non-standard role number. Ask an administrator to review the member IDs before reordering.'
    );
  END IF;

  -- Lock the active set in deterministic order before calculating the swap.
  PERFORM m.id
  FROM public.members m
  WHERE m.approved = true AND m.status = 'approved'
  ORDER BY substring(m.role_number from '[0-9]+$')::bigint,
           m.approved_at ASC NULLS LAST, m.created_at ASC, m.id ASC
  FOR UPDATE;

  SELECT array_agg(m.id ORDER BY substring(m.role_number from '[0-9]+$')::bigint,
                                      m.approved_at ASC NULLS LAST,
                                      m.created_at ASC,
                                      m.id ASC)
  INTO member_ids
  FROM public.members m
  WHERE m.approved = true AND m.status = 'approved'
    AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$';

  target_index := array_position(member_ids, p_member_id);
  IF target_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Approved member not found');
  END IF;

  IF lower(trim(p_direction)) = 'up' THEN
    swap_index := target_index - 1;
  ELSE
    swap_index := target_index + 1;
  END IF;

  IF swap_index < 1 OR swap_index > coalesce(array_length(member_ids, 1), 0) THEN
    RETURN jsonb_build_object('ok', true, 'moved', false, 'message', 'Member is already at that end of the list');
  END IF;

  swap_id := member_ids[swap_index];
  member_ids[swap_index] := member_ids[target_index];
  member_ids[target_index] := swap_id;

  SELECT substring(m.role_number from '^YYC-([0-9]{4})-M-')
  INTO active_year
  FROM public.members m
  WHERE m.approved = true AND m.status = 'approved'
  ORDER BY substring(m.role_number from '[0-9]+$')::bigint,
           m.approved_at ASC NULLS LAST, m.created_at ASC, m.id ASC
  LIMIT 1;

  active_year := coalesce(active_year, to_char(current_date, 'YYYY'));

  -- Remember old numbers so a previously issued old-number QR cannot verify as another person.
  INSERT INTO private.member_roll_number_history (role_number, member_id)
  SELECT m.role_number, m.id
  FROM public.members m
  WHERE m.approved = true AND m.status = 'approved'
    AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$'
  ON CONFLICT (role_number, member_id) DO NOTHING;

  SELECT m.role_number INTO old_role
  FROM public.members m WHERE m.id = p_member_id;

  -- Move every active number to a unique temporary value first. The existing member-card
  -- sync trigger follows these updates, so the unique member_cards.role_number index remains safe.
  UPDATE public.members m
  SET role_number = 'YYC-RESORT-' ||
      lpad(substring(m.role_number from '[0-9]+$'),
           greatest(10, length(coalesce(substring(m.role_number from '[0-9]+$'), ''))),
           '0') || '-' || m.id::text
  WHERE m.approved = true AND m.status = 'approved';

  -- Apply the manually swapped order as a compact, gap-free series.
  FOR i IN 1..array_length(member_ids, 1) LOOP
    UPDATE public.members m
    SET role_number = 'YYC-' || active_year || '-M-' ||
                      lpad(i::text, greatest(2, length(i::text)), '0')
    WHERE m.id = member_ids[i];
  END LOOP;

  SELECT m.role_number INTO new_role
  FROM public.members m WHERE m.id = p_member_id;

  INSERT INTO public.admin_activity_log(actor_username, action, entity_type, entity_id, summary)
  VALUES (
    left(coalesce(leader_name, 'YYC Leader'), 120),
    'member_order_changed',
    'member',
    p_member_id,
    left(coalesce((SELECT name FROM public.members WHERE id = p_member_id), 'Member') ||
      ' moved ' || lower(trim(p_direction)) || ': ' || coalesce(old_role, '') || ' → ' || coalesce(new_role, ''), 500)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'moved', true,
    'member_id', p_member_id,
    'old_role_number', old_role,
    'role_number', new_role,
    'members', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('id', m.id, 'name', m.name, 'position', coalesce(m.position, 'MEMBER'),
          'role_number', m.role_number,
          'photo_url', CASE WHEN left(coalesce(m.photo_url, ''), 11) = 'data:image/' THEN '' ELSE coalesce(m.photo_url, '') END)
        ORDER BY substring(m.role_number from '[0-9]+$')::bigint,
                 m.approved_at ASC NULLS LAST, m.created_at ASC, m.id ASC
      ), '[]'::jsonb)
      FROM public.members m
      WHERE m.approved = true AND m.status = 'approved'
        AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$'
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A role number conflict occurred. No reorder was saved.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Could not save the new member order. No partial reorder was saved.');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_member_order_data(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reorder_member(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_member_order_data(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reorder_member(text, uuid, text) TO anon, authenticated;

-- Remove direct reorder access from leader sessions; only Admin Panel RPCs may reorder.
REVOKE ALL ON FUNCTION public.leader_member_order_data(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.leader_reorder_member(text, uuid, text) FROM anon, authenticated;
