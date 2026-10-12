ALTER TABLE public.yyc_reels
  ADD COLUMN IF NOT EXISTS event_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reel_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reel_total integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.yyc_reels'::regclass AND conname='yyc_reels_event_name_length_chk') THEN
    ALTER TABLE public.yyc_reels ADD CONSTRAINT yyc_reels_event_name_length_chk CHECK (char_length(event_name) <= 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.yyc_reels'::regclass AND conname='yyc_reels_reel_total_positive_chk') THEN
    ALTER TABLE public.yyc_reels ADD CONSTRAINT yyc_reels_reel_total_positive_chk CHECK (reel_total >= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS yyc_reels_event_reel_number_uidx
  ON public.yyc_reels (lower(btrim(event_name)), reel_number)
  WHERE btrim(event_name) <> '';

DROP FUNCTION IF EXISTS public.yyc_reels_admin_save(text, uuid, text, text, text, text, text, text, text, text, integer);

CREATE FUNCTION public.yyc_reels_admin_save(
  p_token text, p_id uuid, p_title text, p_caption text, p_category text,
  p_video_url text, p_video_path text, p_thumbnail_url text, p_thumbnail_path text,
  p_status text, p_sort_order integer, p_event_name text DEFAULT '',
  p_reel_number integer DEFAULT 1, p_reel_total integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.yyc_reels;
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'draft'));
  v_title text := trim(coalesce(p_title, ''));
  v_video_url text := trim(coalesce(p_video_url, ''));
  v_video_path text := trim(coalesce(p_video_path, ''));
  v_thumbnail_url text := trim(coalesce(p_thumbnail_url, ''));
  v_thumbnail_path text := trim(coalesce(p_thumbnail_path, ''));
  v_event_name text := left(trim(coalesce(p_event_name, '')), 160);
  v_reel_number integer := greatest(1, coalesce(p_reel_number, 1));
  v_reel_total integer := greatest(1, coalesce(p_reel_total, 1));
  v_old_event_name text := '';
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  IF v_title = '' OR char_length(v_title) > 140 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter a title of 1–140 characters.');
  END IF;
  IF char_length(coalesce(p_caption, '')) > 2400 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Caption is too long (maximum 2400 characters).');
  END IF;
  IF v_status NOT IN ('published','draft','hidden') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid publication status.');
  END IF;
  IF v_video_path NOT LIKE 'reels/video/%'
     OR v_video_url NOT LIKE 'https://vrllozfzheikjbhxvpkx.supabase.co/storage/v1/object/public/yyc-reels/reels/video/%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Upload the video through Reel Studio first.');
  END IF;
  IF v_thumbnail_path <> '' AND (
       v_thumbnail_path NOT LIKE 'reels/thumbnail/%'
       OR v_thumbnail_url NOT LIKE 'https://vrllozfzheikjbhxvpkx.supabase.co/storage/v1/object/public/yyc-reels/reels/thumbnail/%'
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Thumbnail upload could not be verified.');
  END IF;

  IF v_event_name = '' THEN
    v_reel_number := 1;
    v_reel_total := 1;
  ELSE
    IF v_reel_total > 100 OR v_reel_number > v_reel_total THEN
      RETURN jsonb_build_object('ok', false, 'error', 'For event Reels, choose a valid Reel number and total (maximum 100).');
    END IF;
    IF p_id IS NOT NULL THEN
      SELECT coalesce(event_name, '') INTO v_old_event_name
      FROM public.yyc_reels WHERE id = p_id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.yyc_reels r
      WHERE lower(btrim(r.event_name)) = lower(btrim(v_event_name))
        AND r.reel_number = v_reel_number
        AND r.id IS DISTINCT FROM p_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'That event already has a Reel with this number. Use the missing-number uploader or edit the existing Reel.');
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.yyc_reels
      (title, caption, category, video_url, video_path, thumbnail_url, thumbnail_path, status,
       sort_order, event_name, reel_number, reel_total, updated_at)
    VALUES
      (v_title, coalesce(p_caption, ''), coalesce(nullif(trim(p_category), ''), 'Community'),
       v_video_url, v_video_path, v_thumbnail_url, v_thumbnail_path, v_status,
       coalesce(p_sort_order, 0), v_event_name, v_reel_number, v_reel_total, now())
    RETURNING * INTO v;
    PERFORM public.admin_log_activity(p_token, CASE WHEN v_status='published' THEN 'published' ELSE 'created' END, 'reel', v.id, v.title);
  ELSE
    UPDATE public.yyc_reels
    SET title = v_title, caption = coalesce(p_caption, ''),
        category = coalesce(nullif(trim(p_category), ''), 'Community'),
        video_url = v_video_url, video_path = v_video_path,
        thumbnail_url = v_thumbnail_url, thumbnail_path = v_thumbnail_path,
        status = v_status, sort_order = coalesce(p_sort_order, 0),
        event_name = v_event_name, reel_number = v_reel_number, reel_total = v_reel_total,
        updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Reel not found.');
    END IF;
    PERFORM public.admin_log_activity(p_token, CASE WHEN v_status='published' THEN 'updated_published' ELSE 'updated' END, 'reel', v.id, v.title);
  END IF;

  IF v_event_name <> '' THEN
    UPDATE public.yyc_reels SET reel_total = v_reel_total
    WHERE lower(btrim(event_name)) = lower(btrim(v_event_name));
  END IF;

  IF coalesce(v_old_event_name, '') <> ''
     AND lower(btrim(v_old_event_name)) <> lower(btrim(v_event_name)) THEN
    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY reel_number, sort_order, created_at, id)::integer AS new_number
      FROM public.yyc_reels WHERE lower(btrim(event_name)) = lower(btrim(v_old_event_name))
    )
    UPDATE public.yyc_reels r SET reel_number = 1000000 + ranked.new_number
    FROM ranked WHERE r.id = ranked.id;

    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY reel_number, sort_order, created_at, id)::integer AS new_number,
             count(*) OVER ()::integer AS new_total
      FROM public.yyc_reels WHERE lower(btrim(event_name)) = lower(btrim(v_old_event_name))
    )
    UPDATE public.yyc_reels r SET reel_number = ranked.new_number, reel_total = ranked.new_total
    FROM ranked WHERE r.id = ranked.id;
  END IF;

  SELECT * INTO v FROM public.yyc_reels WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'reel', to_jsonb(v));
END;
$function$;

REVOKE ALL ON FUNCTION public.yyc_reels_admin_save(text, uuid, text, text, text, text, text, text, text, text, integer, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yyc_reels_admin_save(text, uuid, text, text, text, text, text, text, text, text, integer, text, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.yyc_reels_admin_delete(p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.yyc_reels;
BEGIN
  IF NOT public._admin_ok(p_token) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;
  DELETE FROM public.yyc_reels WHERE id = p_id RETURNING * INTO v;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reel not found.');
  END IF;

  IF coalesce(trim(v.event_name), '') <> '' THEN
    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY reel_number, sort_order, created_at, id)::integer AS new_number
      FROM public.yyc_reels WHERE lower(btrim(event_name)) = lower(btrim(v.event_name))
    )
    UPDATE public.yyc_reels r SET reel_number = 1000000 + ranked.new_number
    FROM ranked WHERE r.id = ranked.id;

    WITH ranked AS (
      SELECT id, row_number() OVER (ORDER BY reel_number, sort_order, created_at, id)::integer AS new_number,
             count(*) OVER ()::integer AS new_total
      FROM public.yyc_reels WHERE lower(btrim(event_name)) = lower(btrim(v.event_name))
    )
    UPDATE public.yyc_reels r SET reel_number = ranked.new_number, reel_total = ranked.new_total
    FROM ranked WHERE r.id = ranked.id;
  END IF;

  PERFORM public.admin_log_activity(p_token, 'deleted', 'reel', v.id, v.title);
  RETURN jsonb_build_object('ok', true, 'id', v.id, 'video_path', v.video_path, 'thumbnail_path', v.thumbnail_path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.yyc_reels_public_list()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'ok', true,
    'reels', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id, 'title', r.title, 'caption', r.caption, 'category', r.category,
          'video_url', r.video_url, 'thumbnail_url', r.thumbnail_url, 'status', r.status,
          'sort_order', r.sort_order, 'event_name', r.event_name,
          'reel_number', r.reel_number, 'reel_total', r.reel_total, 'created_at', r.created_at
        ) ORDER BY r.sort_order ASC, r.created_at DESC
      ),
      '[]'::jsonb
    )
  )
  FROM public.yyc_reels r
  WHERE r.status = 'published';
END;
$function$;
