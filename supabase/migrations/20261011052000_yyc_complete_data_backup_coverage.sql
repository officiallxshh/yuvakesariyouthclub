-- Expand YYC logical backups to cover persisted business modules and delivery/audit history.
-- Existing snapshots are preserved; the new format is used for future snapshots.
-- Authentication hashes and active sessions are deliberately excluded.

CREATE OR REPLACE FUNCTION private.yyc_build_backup_snapshot()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'backup_format_version', 2,
    'backup_scope', 'yyc_business_data_and_audit',
    'generated_at', clock_timestamp(),
    'settings', (SELECT to_jsonb(s) FROM public.site_settings s WHERE s.id = true),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'password_hash' ORDER BY m.created_at, m.id) FROM public.members m), '[]'::jsonb),
    'leaders', COALESCE((SELECT jsonb_agg(to_jsonb(l) - 'password_hash' ORDER BY l.created_at, l.id) FROM public.leaders l), '[]'::jsonb),
    'announcements', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.published_at, a.id) FROM public.announcements a), '[]'::jsonb),
    'news', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.published_at, n.id) FROM public.news n), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.event_date NULLS LAST, e.created_at, e.id) FROM public.events e), '[]'::jsonb),
    'gallery', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at, g.id) FROM public.gallery g), '[]'::jsonb),
    'swags', COALESCE((SELECT jsonb_agg(to_jsonb(sw) ORDER BY sw.sort_order, sw.created_at, sw.id) FROM public.swags sw), '[]'::jsonb),
    'volunteers', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.created_at, v.id) FROM public.volunteers v), '[]'::jsonb),
    'achievements', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.sort_order, a.created_at, a.id) FROM public.achievements a), '[]'::jsonb),
    'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.sort_order, h.created_at, h.id) FROM public.club_history h), '[]'::jsonb),
    'finance', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.entry_date, f.created_at, f.id) FROM public.finance f), '[]'::jsonb),
    'contacts', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at, c.id) FROM public.contact_messages c), '[]'::jsonb),
    'attendance', COALESCE((SELECT jsonb_agg(to_jsonb(at) ORDER BY at.marked_at, at.id) FROM public.attendance at), '[]'::jsonb),
    'member_cards', COALESCE((SELECT jsonb_agg(to_jsonb(mc) ORDER BY mc.issued_at NULLS LAST, mc.updated_at, mc.id) FROM public.member_cards mc), '[]'::jsonb),
    'event_rsvps', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at, r.id) FROM public.event_rsvps r), '[]'::jsonb),
    'member_notifications', COALESCE((SELECT jsonb_agg(to_jsonb(mn) ORDER BY mn.created_at, mn.id) FROM public.member_notifications mn), '[]'::jsonb),
    'admin_activity_log', COALESCE((SELECT jsonb_agg(to_jsonb(al) ORDER BY al.created_at, al.id) FROM public.admin_activity_log al), '[]'::jsonb),
    'admin_message_deliveries', COALESCE((SELECT jsonb_agg(to_jsonb(md) ORDER BY md.created_at, md.id) FROM public.admin_message_deliveries md), '[]'::jsonb),
    'admin_message_delivery_events', COALESCE((SELECT jsonb_agg(to_jsonb(me) ORDER BY me.received_at, me.id) FROM public.admin_message_delivery_events me), '[]'::jsonb),
    'storage_objects_manifest', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket_id', o.bucket_id,
          'name', o.name,
          'created_at', o.created_at,
          'updated_at', o.updated_at,
          'metadata', o.metadata
        )
        ORDER BY o.bucket_id, o.name
      )
      FROM storage.objects o
      WHERE o.bucket_id IN ('member-photos', 'yyc-media', 'yyc-certificates')
    ), '[]'::jsonb),
    'table_counts', jsonb_build_object(
      'members', (SELECT count(*) FROM public.members),
      'leaders', (SELECT count(*) FROM public.leaders),
      'announcements', (SELECT count(*) FROM public.announcements),
      'news', (SELECT count(*) FROM public.news),
      'events', (SELECT count(*) FROM public.events),
      'gallery', (SELECT count(*) FROM public.gallery),
      'swags', (SELECT count(*) FROM public.swags),
      'volunteers', (SELECT count(*) FROM public.volunteers),
      'achievements', (SELECT count(*) FROM public.achievements),
      'club_history', (SELECT count(*) FROM public.club_history),
      'finance', (SELECT count(*) FROM public.finance),
      'contact_messages', (SELECT count(*) FROM public.contact_messages),
      'attendance', (SELECT count(*) FROM public.attendance),
      'member_cards', (SELECT count(*) FROM public.member_cards),
      'event_rsvps', (SELECT count(*) FROM public.event_rsvps),
      'member_notifications', (SELECT count(*) FROM public.member_notifications),
      'admin_activity_log', (SELECT count(*) FROM public.admin_activity_log),
      'admin_message_deliveries', (SELECT count(*) FROM public.admin_message_deliveries),
      'admin_message_delivery_events', (SELECT count(*) FROM public.admin_message_delivery_events),
      'storage_objects', (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('member-photos', 'yyc-media', 'yyc-certificates'))
    ),
    'excluded_sensitive_data', 'Password hashes, active session tokens, and login-attempt throttling state are intentionally excluded from application-level snapshots.'
  );
$function$;

REVOKE ALL ON FUNCTION private.yyc_build_backup_snapshot() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_backup_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  RETURN private.yyc_build_backup_snapshot() || jsonb_build_object('ok', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_backup_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  last_at timestamptz;
  last_snapshot jsonb;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  SELECT s.created_at, s.snapshot
    INTO last_at, last_snapshot
    FROM public.yyc_backup_snapshots s
    ORDER BY s.created_at DESC
    LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot_count', (SELECT count(*) FROM public.yyc_backup_snapshots),
    'last_snapshot_at', last_at,
    'last_snapshot_age_hours', CASE WHEN last_at IS NULL THEN NULL ELSE round((extract(epoch FROM (clock_timestamp() - last_at)) / 3600.0)::numeric, 2) END,
    'cron_enabled', EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'yyc-daily-backup' AND active),
    'backup_format_version', last_snapshot->'backup_format_version',
    'latest_table_counts', COALESCE(last_snapshot->'table_counts', '{}'::jsonb),
    'snapshot_retention_days', 30
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.yyc_run_automated_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.yyc_backup_snapshots(snapshot)
  VALUES (private.yyc_build_backup_snapshot());

  -- Keep the current rolling window; primary records remain in their live tables.
  DELETE FROM public.yyc_backup_snapshots
  WHERE created_at < clock_timestamp() - interval '30 days';
END
$function$;
