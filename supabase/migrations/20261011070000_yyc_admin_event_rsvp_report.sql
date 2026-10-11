-- YYC admin-only event RSVP report.
-- Read-only report over existing RSVP and membership records; no row mutations.
CREATE OR REPLACE FUNCTION public.admin_event_rsvp_report(
  p_token text,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  event_row record;
  eligible_count integer := 0;
  attending_count integer := 0;
  maybe_count integer := 0;
  not_attending_count integer := 0;
  response_count integer := 0;
  attendee_rows jsonb := '[]'::jsonb;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  IF p_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Select an event to view its RSVP report');
  END IF;

  SELECT e.id, e.title, e.event_date, e.location, coalesce(e.status, 'published') AS status
  INTO event_row
  FROM public.events e
  WHERE e.id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Event not found');
  END IF;

  SELECT count(*)::integer
  INTO eligible_count
  FROM public.members m
  WHERE coalesce(m.status, 'pending') = 'approved'
    AND coalesce(m.approved, false) = true;

  SELECT
    count(*) FILTER (WHERE r.status = 'attending')::integer,
    count(*) FILTER (WHERE r.status = 'maybe')::integer,
    count(*) FILTER (WHERE r.status = 'not_attending')::integer,
    count(*)::integer
  INTO attending_count, maybe_count, not_attending_count, response_count
  FROM public.event_rsvps r
  JOIN public.members m ON m.id = r.member_id
  WHERE r.event_id = p_event_id
    AND coalesce(m.status, 'pending') = 'approved'
    AND coalesce(m.approved, false) = true;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'member_id', roster.member_id,
        'name', roster.name,
        'role_number', roster.role_number,
        'position', roster.position,
        'status', roster.status,
        'updated_at', roster.updated_at
      )
      ORDER BY
        CASE roster.status WHEN 'attending' THEN 1 WHEN 'maybe' THEN 2 ELSE 3 END,
        lower(coalesce(roster.name, ''))
    ),
    '[]'::jsonb
  )
  INTO attendee_rows
  FROM (
    SELECT
      m.id AS member_id,
      m.name,
      m.role_number,
      m.position,
      r.status,
      r.updated_at
    FROM public.event_rsvps r
    JOIN public.members m ON m.id = r.member_id
    WHERE r.event_id = p_event_id
      AND coalesce(m.status, 'pending') = 'approved'
      AND coalesce(m.approved, false) = true
    ORDER BY
      CASE r.status WHEN 'attending' THEN 1 WHEN 'maybe' THEN 2 ELSE 3 END,
      lower(coalesce(m.name, ''))
  ) roster;

  RETURN jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'id', event_row.id,
      'title', event_row.title,
      'event_date', event_row.event_date,
      'location', event_row.location,
      'status', event_row.status
    ),
    'summary', jsonb_build_object(
      'eligible_members', eligible_count,
      'attending', attending_count,
      'maybe', maybe_count,
      'not_attending', not_attending_count,
      'responses', response_count,
      'no_response', greatest(eligible_count - response_count, 0)
    ),
    'attendees', attendee_rows
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid event identifier');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Could not load event RSVP report');
END
$function$;

REVOKE ALL ON FUNCTION public.admin_event_rsvp_report(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_event_rsvp_report(text, uuid) TO anon, authenticated, service_role;
