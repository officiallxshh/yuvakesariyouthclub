CREATE TABLE IF NOT EXISTS private.member_roll_number_history (
  role_number text NOT NULL,
  member_id uuid NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_roll_number_history_pkey PRIMARY KEY (role_number, member_id)
);

REVOKE ALL ON TABLE private.member_roll_number_history FROM PUBLIC, anon, authenticated;

INSERT INTO private.member_roll_number_history (role_number, member_id)
SELECT m.role_number, m.id
FROM public.members m
WHERE m.approved = true AND m.status = 'approved' AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$'
ON CONFLICT (role_number, member_id) DO NOTHING;

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
  /* Preserve the ownership of all existing roll numbers before changing them. */
  INSERT INTO private.member_roll_number_history (role_number, member_id)
  SELECT m.role_number, m.id
  FROM public.members m
  WHERE m.approved = true
    AND m.status = 'approved'
    AND m.role_number ~ '^YYC-[0-9]{4}-M-[0-9]+$'
  ON CONFLICT (role_number, member_id) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.public_verify_identity(p_role_number text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT coalesce(
    (
      /* Member QR payloads use a stable UUID and always return the current roll number. */
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
      /* A roll number is valid only while it still identifies the same member. */
      SELECT jsonb_build_object(
        'ok', true, 'type', 'member', 'name', m.name, 'role', coalesce(m.position, 'MEMBER'),
        'role_number', m.role_number, 'status', 'ACTIVE', 'photo_url',
        CASE WHEN left(coalesce(m.photo_url, ''), 11) = 'data:image/' THEN '' ELSE coalesce(m.photo_url, '') END
      )
      FROM public.members m
      WHERE trim(coalesce(m.role_number, '')) = trim(p_role_number)
        AND coalesce(m.status, CASE WHEN m.approved THEN 'approved' ELSE 'pending' END) = 'approved'
        AND NOT EXISTS (
          SELECT 1
          FROM private.member_roll_number_history h
          WHERE upper(trim(h.role_number)) = upper(trim(m.role_number))
            AND h.member_id <> m.id
        )
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
