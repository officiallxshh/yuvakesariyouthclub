-- YYC volunteer review and email notifications.
-- Existing volunteer applications remain unchanged; historical email statuses are marked skipped.

ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS application_email_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS application_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_email_error text,
  ADD COLUMN IF NOT EXISTS admin_alert_email_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_alert_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_alert_email_error text,
  ADD COLUMN IF NOT EXISTS decision_email_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decision_email_for_status text,
  ADD COLUMN IF NOT EXISTS decision_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_email_error text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'volunteers_application_email_status_check') THEN
    ALTER TABLE public.volunteers ADD CONSTRAINT volunteers_application_email_status_check
      CHECK (application_email_status IN ('pending','sending','sent','failed','skipped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'volunteers_admin_alert_email_status_check') THEN
    ALTER TABLE public.volunteers ADD CONSTRAINT volunteers_admin_alert_email_status_check
      CHECK (admin_alert_email_status IN ('pending','sending','sent','failed','skipped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'volunteers_decision_email_status_check') THEN
    ALTER TABLE public.volunteers ADD CONSTRAINT volunteers_decision_email_status_check
      CHECK (decision_email_status IN ('pending','sending','sent','failed','skipped'));
  END IF;
END $$;

-- Only applications created after this feature goes live should be eligible for its first email.
UPDATE public.volunteers
SET application_email_status = 'skipped',
    admin_alert_email_status = 'skipped',
    decision_email_status = 'skipped'
WHERE created_at < clock_timestamp() - interval '30 minutes'
  AND application_email_status = 'pending'
  AND admin_alert_email_status = 'pending'
  AND decision_email_status = 'pending';

CREATE OR REPLACE FUNCTION public.admin_dashboard(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE s public.site_settings;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok',false,'error','Unauthorized');
  END IF;
  SELECT * INTO s FROM public.site_settings WHERE id=true;
  RETURN jsonb_build_object(
    'ok',true,
    'settings',to_jsonb(s),
    'members',coalesce((SELECT jsonb_agg(to_jsonb(m)-'password_hash' ORDER BY m.created_at DESC) FROM public.members m),'[]'::jsonb),
    'leaders',coalesce((SELECT jsonb_agg((to_jsonb(l)-'password_hash') || jsonb_build_object('login_enabled',(coalesce(l.password_hash,'')<>'')) ORDER BY l.created_at) FROM public.leaders l),'[]'::jsonb),
    'updates',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY coalesce(a.event_date,a.published_at::date) DESC,a.published_at DESC) FROM public.announcements a),'[]'::jsonb),
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'event_date',e.event_date,'location',e.location,'image_url',e.image_url,'image_format',e.image_format,'status',coalesce(e.status,'published'),'featured',coalesce(e.featured,false),'category',coalesce(e.category,'GENERAL'),'publish_at',e.publish_at,'slug',e.slug,'sort_order',e.sort_order,'created_at',e.created_at) ORDER BY e.sort_order,e.event_date NULLS LAST,e.created_at DESC) FROM public.events e),'[]'::jsonb),
    'gallery',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'src',g.image_url,'caption',g.caption,'status',coalesce(g.status,'published'),'image_format',coalesce(g.image_format,'original'),'featured',coalesce(g.featured,false),'album',coalesce(g.album,'GENERAL'),'publish_at',g.publish_at,'slug',g.slug,'sort_order',g.sort_order,'created_at',g.created_at) ORDER BY g.sort_order,g.created_at DESC) FROM public.gallery g),'[]'::jsonb),
    'swags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',sw.id,'title',sw.title,'category',sw.category,'price',sw.price,'sizes',sw.sizes,'description',sw.description,'image_url',sw.image_url,'order_url',sw.order_url,'status',sw.status,'sort_order',sw.sort_order,'created_at',sw.created_at,'updated_at',sw.updated_at) ORDER BY sw.sort_order,sw.created_at DESC) FROM public.swags sw),'[]'::jsonb),
    'pending_updates',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.published_at DESC) FROM public.announcements a WHERE a.status='pending'),'[]'::jsonb),
    'pending_gallery',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'src',g.image_url,'caption',g.caption,'status',g.status,'created_at',g.created_at) ORDER BY g.created_at DESC) FROM public.gallery g WHERE g.status='pending'),'[]'::jsonb),
    'volunteers',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC) FROM public.volunteers v),'[]'::jsonb),
    'pending_volunteers',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC) FROM public.volunteers v WHERE coalesce(v.status,'pending')='pending'),'[]'::jsonb)
  );
END
$function$;

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
      'decision_email_sent_at',v.decision_email_sent_at
    ) ORDER BY v.created_at DESC) FROM public.volunteers v),'[]'::jsonb),
    'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'subject',c.subject,'message',c.message,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at) ORDER BY c.created_at DESC) FROM public.contact_messages c),'[]'::jsonb),
    'finance',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'entry_date',f.entry_date,'description',f.description,'amount',f.amount,'entry_type',f.entry_type,'created_at',f.created_at) ORDER BY f.entry_date DESC,f.created_at DESC) FROM public.finance f),'[]'::jsonb),
    'attendance',coalesce((SELECT jsonb_agg(jsonb_build_object('id',at.id,'member_id',at.member_id,'leader_id',at.leader_id,'event_id',at.event_id,'present',at.present,'marked_at',at.marked_at) ORDER BY at.marked_at DESC) FROM public.attendance at LIMIT 500),'[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_volunteer_action(p_token text, p_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_status text;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok',false,'error','Unauthorized');
  END IF;

  IF lower(p_action)='approve' THEN
    UPDATE public.volunteers SET status='approved',approved=true,
      decision_email_status='pending',decision_email_for_status=NULL,
      decision_email_sent_at=NULL,decision_email_error=NULL
    WHERE id=p_id RETURNING status INTO v_status;
  ELSIF lower(p_action)='deny' THEN
    UPDATE public.volunteers SET status='denied',approved=false,
      decision_email_status='pending',decision_email_for_status=NULL,
      decision_email_sent_at=NULL,decision_email_error=NULL
    WHERE id=p_id RETURNING status INTO v_status;
  ELSIF lower(p_action)='archive' THEN
    UPDATE public.volunteers SET status='archived',
      decision_email_status='pending',decision_email_for_status=NULL,
      decision_email_sent_at=NULL,decision_email_error=NULL
    WHERE id=p_id RETURNING status INTO v_status;
  ELSIF lower(p_action)='pending' THEN
    UPDATE public.volunteers SET status='pending',approved=false,
      decision_email_status='pending',decision_email_for_status=NULL,
      decision_email_sent_at=NULL,decision_email_error=NULL
    WHERE id=p_id RETURNING status INTO v_status;
  ELSE
    RETURN jsonb_build_object('ok',false,'error','Invalid action');
  END IF;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Volunteer application not found');
  END IF;

  PERFORM public.admin_log_activity(p_token,'volunteer_'||lower(p_action),'volunteer',p_id,'Volunteer status changed');
  RETURN jsonb_build_object('ok',true,'status',v_status,'id',p_id);
END
$function$;
