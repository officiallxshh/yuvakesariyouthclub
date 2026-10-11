-- YYC private volunteer review notes.
-- Additive only: no existing application rows or statuses are changed.
ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS review_notes_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteers_review_notes_length_check'
      AND conrelid = 'public.volunteers'::regclass
  ) THEN
    ALTER TABLE public.volunteers
      ADD CONSTRAINT volunteers_review_notes_length_check
      CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000);
  END IF;
END
$$;

COMMENT ON COLUMN public.volunteers.review_notes IS
  'Private administrator-only notes for reviewing this volunteer application.';
COMMENT ON COLUMN public.volunteers.review_notes_updated_at IS
  'Timestamp of the most recent administrator edit to private volunteer review notes.';

CREATE OR REPLACE FUNCTION public.admin_feature_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok',false,'error','Unauthorized');
  END IF;
  RETURN jsonb_build_object(
    'ok',true,
    'settings',(SELECT to_jsonb(s) FROM public.site_settings s WHERE s.id=true),
    'achievements',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.sort_order,a.achieved_on DESC NULLS LAST,a.created_at DESC) FROM public.achievements a),'[]'::jsonb),
    'history',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.sort_order,h.year_label,h.created_at) FROM public.club_history h),'[]'::jsonb),
    'volunteers',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',v.id,'name',v.name,'phone',v.phone,'email',v.email,'area',v.area,'skills',v.skills,
      'availability',v.availability,'message',v.message,'approved',v.approved,'status',v.status,
      'source',v.source,'created_at',v.created_at,'updated_at',v.updated_at,
      'application_email_status',v.application_email_status,'application_email_sent_at',v.application_email_sent_at,
      'admin_alert_email_status',v.admin_alert_email_status,'admin_alert_email_sent_at',v.admin_alert_email_sent_at,
      'decision_email_status',v.decision_email_status,'decision_email_for_status',v.decision_email_for_status,
      'decision_email_sent_at',v.decision_email_sent_at,
      'review_notes',v.review_notes,'review_notes_updated_at',v.review_notes_updated_at
    ) ORDER BY v.created_at DESC) FROM public.volunteers v),'[]'::jsonb),
    'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'subject',c.subject,'message',c.message,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at) ORDER BY c.created_at DESC) FROM public.contact_messages c),'[]'::jsonb),
    'finance',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'entry_date',f.entry_date,'description',f.description,'amount',f.amount,'entry_type',f.entry_type,'created_at',f.created_at) ORDER BY f.entry_date DESC,f.created_at DESC) FROM public.finance f),'[]'::jsonb),
    'attendance',coalesce((SELECT jsonb_agg(jsonb_build_object('id',at.id,'member_id',at.member_id,'leader_id',at.leader_id,'event_id',at.event_id,'present',at.present,'marked_at',at.marked_at) ORDER BY at.marked_at DESC) FROM public.attendance at LIMIT 500),'[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_volunteer_save_review_note(
  p_token text,
  p_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_saved_id uuid;
  v_saved_at timestamptz;
  v_notes text;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok',false,'error','Unauthorized');
  END IF;

  IF char_length(coalesce(p_notes,'')) > 2000 THEN
    RETURN jsonb_build_object('ok',false,'error','Review notes must be 2000 characters or fewer');
  END IF;

  v_notes := nullif(btrim(coalesce(p_notes,'')), '');

  UPDATE public.volunteers
  SET review_notes = v_notes,
      review_notes_updated_at = clock_timestamp()
  WHERE id = p_id
  RETURNING id, review_notes_updated_at INTO v_saved_id, v_saved_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','Volunteer application not found');
  END IF;

  PERFORM public.admin_log_activity(
    p_token,
    'volunteer_review_note_saved',
    'volunteer',
    p_id,
    'Private volunteer review note updated'
  );

  RETURN jsonb_build_object(
    'ok',true,
    'id',v_saved_id,
    'review_notes_updated_at',v_saved_at
  );
END
$function$;

REVOKE ALL ON FUNCTION public.admin_volunteer_save_review_note(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_volunteer_save_review_note(text, uuid, text) TO anon, authenticated, service_role;
