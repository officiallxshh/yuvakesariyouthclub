CREATE OR REPLACE FUNCTION private.resequence_approved_member_roll_numbers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  active_year text;
  rows_changed integer := 0;
BEGIN
  /*
   * Keep the existing series year and order members by their current numeric
   * roll number. A temporary unique value lets the active unique index remain
   * valid while roll numbers are compacted without gaps.
   */
  SELECT substring(m.role_number from '^YYC-([0-9]{4})-M-')
    INTO active_year
  FROM public.members m
  WHERE m.approved = true
    AND m.status = 'approved'
    AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$'
  ORDER BY substring(m.role_number from '[0-9]+$')::bigint,
           m.approved_at ASC NULLS LAST,
           m.created_at ASC,
           m.id ASC
  LIMIT 1;

  active_year := coalesce(active_year, to_char(current_date, 'YYYY'));

  UPDATE public.members m
     SET role_number =
       'YYC-RESORT-' ||
       coalesce(
         lpad(substring(m.role_number from '[0-9]+$'),
              greatest(10, length(coalesce(substring(m.role_number from '[0-9]+$'), ''))),
              '0'),
         '9999999999'
       ) ||
       '-' || m.id::text
   WHERE m.approved = true
     AND m.status = 'approved';

  WITH ranked AS (
    SELECT m.id,
           row_number() OVER (
             ORDER BY
               substring(m.role_number from '^YYC-RESORT-([0-9]+)-')::bigint ASC NULLS LAST,
               m.approved_at ASC NULLS LAST,
               m.created_at ASC,
               m.id ASC
           ) AS rn
    FROM public.members m
    WHERE m.approved = true
      AND m.status = 'approved'
      AND m.role_number LIKE 'YYC-RESORT-%'
  )
  UPDATE public.members m
     SET role_number =
       'YYC-' || active_year || '-M-' ||
       lpad(ranked.rn::text, greatest(2, length(ranked.rn::text)), '0')
    FROM ranked
   WHERE m.id = ranked.id;

  GET DIAGNOSTICS rows_changed = ROW_COUNT;
  RETURN rows_changed;
END;
$function$
;

REVOKE ALL ON FUNCTION private.resequence_approved_member_roll_numbers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_member_action(p_token text, p_member_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  m public.members;
  primary_member public.members;
  next_role bigint;
  role_text text;
  act text;
  was_active boolean := false;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admin session expired');
  END IF;

  /* Serialize approvals/removals so two admins cannot assign the same number. */
  PERFORM pg_advisory_xact_lock(hashtext('yyc-active-member-roll-sequence')::bigint);

  SELECT * INTO m FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found');
  END IF;

  was_active := coalesce(m.approved, false) AND coalesce(m.status, '') = 'approved';
  act := lower(trim(p_action));

  IF act = 'approve' THEN
    SELECT * INTO primary_member
    FROM public.members x
    WHERE x.id <> m.id
      AND x.approved = true
      AND x.status = 'approved'
      AND (
        (nullif(trim(m.email), '') IS NOT NULL AND lower(trim(x.email)) = lower(trim(m.email)))
        OR
        (length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) >= 7
         AND regexp_replace(coalesce(x.phone, ''), '[^0-9]', '', 'g') =
             regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'))
      )
    ORDER BY x.approved_at ASC NULLS LAST, x.created_at ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.members
         SET approved = false, status = 'duplicate', duplicate_of = primary_member.id
       WHERE id = m.id
       RETURNING * INTO m;

      DELETE FROM public.member_sessions WHERE member_id = m.id;
      IF was_active THEN
        PERFORM private.resequence_approved_member_roll_numbers();
      END IF;
      PERFORM public.admin_log_activity(p_token, 'duplicate', 'member', m.id, m.name);

      RETURN jsonb_build_object(
        'ok', true, 'action', 'duplicate', 'member_id', m.id,
        'primary_member_id', primary_member.id,
        'message', 'Duplicate application marked. Existing approved member account kept as primary.'
      );
    END IF;

    SELECT coalesce(max(substring(role_number from '[0-9]+$')::bigint), 0) + 1
      INTO next_role
    FROM public.members
    WHERE approved = true
      AND status = 'approved'
      AND role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$';

    role_text := 'YYC-2026-M-' ||
      lpad(next_role::text, greatest(2, length(next_role::text)), '0');

    UPDATE public.members
       SET approved = true,
           status = 'approved',
           approved_at = coalesce(approved_at, now()),
           role_number = role_text,
           duplicate_of = null
     WHERE id = p_member_id
     RETURNING * INTO m;

    UPDATE public.members x
       SET approved = false, status = 'duplicate', duplicate_of = m.id
     WHERE x.id <> m.id
       AND coalesce(x.status, 'pending') = 'pending'
       AND (
         (nullif(trim(m.email), '') IS NOT NULL AND lower(trim(x.email)) = lower(trim(m.email)))
         OR
         (length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) >= 7
          AND regexp_replace(coalesce(x.phone, ''), '[^0-9]', '', 'g') =
              regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'))
       );

    PERFORM public.admin_log_activity(p_token, 'approved', 'member', m.id, m.name);

    RETURN jsonb_build_object(
      'ok', true, 'action', 'approved',
      'member', jsonb_build_object(
        'id', m.id, 'role_number', m.role_number, 'name', m.name, 'dob', m.dob,
        'phone', m.phone, 'email', m.email, 'club_name', m.club_name, 'position', m.position,
        'photo_url', m.photo_url, 'photo_scale', m.photo_scale,
        'photo_pos_x', m.photo_pos_x, 'photo_pos_y', m.photo_pos_y
      )
    );
  END IF;

  IF act = 'deny' THEN
    UPDATE public.members
       SET approved = false, status = 'denied'
     WHERE id = p_member_id
     RETURNING * INTO m;

    DELETE FROM public.member_sessions WHERE member_id = p_member_id;
    IF was_active THEN
      PERFORM private.resequence_approved_member_roll_numbers();
    END IF;
    PERFORM public.admin_log_activity(p_token, 'denied', 'member', m.id, m.name);

    RETURN jsonb_build_object('ok', true, 'action', 'denied', 'member_id', p_member_id);
  END IF;

  IF act = 'mark_duplicate' THEN
    SELECT * INTO primary_member
    FROM public.members x
    WHERE x.id <> m.id
      AND x.approved = true
      AND x.status = 'approved'
      AND (
        (nullif(trim(m.email), '') IS NOT NULL AND lower(trim(x.email)) = lower(trim(m.email)))
        OR
        (length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) >= 7
         AND regexp_replace(coalesce(x.phone, ''), '[^0-9]', '', 'g') =
             regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'))
      )
    ORDER BY x.approved_at ASC NULLS LAST, x.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'No approved primary member account found for this duplicate.');
    END IF;

    UPDATE public.members
       SET approved = false, status = 'duplicate', duplicate_of = primary_member.id
     WHERE id = p_member_id
     RETURNING * INTO m;

    DELETE FROM public.member_sessions WHERE member_id = p_member_id;
    IF was_active THEN
      PERFORM private.resequence_approved_member_roll_numbers();
    END IF;
    PERFORM public.admin_log_activity(p_token, 'duplicate', 'member', m.id, m.name);

    RETURN jsonb_build_object('ok', true, 'action', 'duplicate',
      'member_id', p_member_id, 'primary_member_id', primary_member.id);
  END IF;

  IF act = 'remove' THEN
    DELETE FROM public.member_sessions WHERE member_id = p_member_id;
    PERFORM public.admin_log_activity(p_token, 'removed', 'member', p_member_id, coalesce(m.name, 'Member'));
    DELETE FROM public.members WHERE id = p_member_id;

    IF was_active THEN
      PERFORM private.resequence_approved_member_roll_numbers();
    END IF;

    RETURN jsonb_build_object('ok', true, 'action', 'removed', 'member_id', p_member_id,
      'roll_numbers_resequenced', was_active);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'Unknown member action');
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'This member conflicts with another active member account by email or phone. Review the duplicate applications before approving.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', sqlerrm);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.public_verify_identity(p_role_number text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT coalesce(
    (
      /* Fresh member cards verify by stable member UUID, not the mutable roll number. */
      SELECT jsonb_build_object(
        'ok', true, 'type', 'member', 'name', m.name, 'role', coalesce(m.position, 'MEMBER'),
        'role_number', m.role_number, 'status', 'ACTIVE', 'photo_url',
        CASE WHEN left(coalesce(m.photo_url, ''), 11) = 'data:image/' THEN '' ELSE coalesce(m.photo_url, '') END
      )
      FROM public.members m
      WHERE m.id::text = trim(p_role_number)
        AND coalesce(m.status, CASE WHEN m.approved THEN 'approved' ELSE 'pending' END) = 'approved'
      LIMIT 1
    ),
    (
      SELECT jsonb_build_object(
        'ok', true, 'type', 'member', 'name', m.name, 'role', coalesce(m.position, 'MEMBER'),
        'role_number', m.role_number, 'status', 'ACTIVE', 'photo_url',
        CASE WHEN left(coalesce(m.photo_url, ''), 11) = 'data:image/' THEN '' ELSE coalesce(m.photo_url, '') END
      )
      FROM public.members m
      WHERE trim(coalesce(m.role_number, '')) = trim(p_role_number)
        AND coalesce(m.status, CASE WHEN m.approved THEN 'approved' ELSE 'pending' END) = 'approved'
      LIMIT 1
    ),
    (
      SELECT jsonb_build_object(
        'ok', true, 'type', 'leader', 'name', l.name, 'role', coalesce(l.role, 'LEADER'),
        'role_number', l.role_number, 'status', upper(coalesce(l.status, 'active')), 'photo_url',
        CASE WHEN left(coalesce(l.photo_url, ''), 11) = 'data:image/' THEN '' ELSE coalesce(l.photo_url, '') END
      )
      FROM public.leaders l
      WHERE trim(coalesce(l.role_number, '')) = trim(p_role_number)
        AND coalesce(l.status, 'active') = 'active'
      LIMIT 1
    ),
    jsonb_build_object('ok', false, 'error', 'YYC ID not found or no longer active')
  );
$function$
;
