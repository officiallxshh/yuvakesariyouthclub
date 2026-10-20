-- Add podium / runner-up data and multiple event photographs per achievement.
-- Keep image_url as the first-image compatibility cover for existing consumers.

alter table public.achievements
  add column if not exists placement text not null default 'participation';

alter table public.achievements
  add column if not exists image_urls text[] not null default '{}'::text[];

alter table public.achievements
  drop constraint if exists achievements_placement_check;

alter table public.achievements
  add constraint achievements_placement_check
  check (placement = any (array['participation','first','second','third','runner_up','special']::text[]));

update public.achievements
set image_urls = array[image_url]
where coalesce(cardinality(image_urls), 0) = 0
  and nullif(trim(image_url), '') is not null;

create or replace function public.admin_upsert_achievement(p_token text, p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_images text[] := array[]::text[];
  v_cover text;
  v_placement text := coalesce(nullif(trim(p_payload->>'placement'), ''), 'participation');
begin
  if not public._admin_ok(p_token) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select coalesce(array_agg(u.url order by u.ord), array[]::text[])
  into v_images
  from (
    select t.url, min(t.ord) as ord
    from (
      select left(trim(x.value), 2000) as url, x.ordinality as ord
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_payload->'image_urls') = 'array'
             then p_payload->'image_urls' else '[]'::jsonb end
      ) with ordinality as x(value, ordinality)
      where length(trim(x.value)) between 1 and 2000
        and trim(x.value) ~* '^https?://'
    ) as t
    group by t.url
    order by min(t.ord)
    limit 12
  ) as u;

  if coalesce(cardinality(v_images), 0) = 0
     and coalesce(trim(p_payload->>'image_url'), '') ~* '^https?://'
     and length(trim(p_payload->>'image_url')) <= 2000 then
    v_images := array[left(trim(p_payload->>'image_url'), 2000)];
  end if;

  v_cover := coalesce(
    v_images[1],
    nullif(left(trim(coalesce(p_payload->>'image_url', '')), 2000), '')
  );

  if p_id is null then
    insert into public.achievements(
      title, description, image_url, image_urls, placement, achieved_on,
      status, featured, category, publish_at, slug, sort_order
    )
    values(
      left(trim(p_payload->>'title'), 180),
      nullif(left(coalesce(p_payload->>'description', ''), 3000), ''),
      v_cover,
      v_images,
      v_placement,
      nullif(p_payload->>'achieved_on', '')::date,
      coalesce(nullif(p_payload->>'status', ''), 'published'),
      coalesce((p_payload->>'featured')::boolean, false),
      coalesce(nullif(left(trim(p_payload->>'category'), 80), ''), 'GENERAL'),
      nullif(p_payload->>'publish_at', '')::timestamptz,
      nullif(left(trim(p_payload->>'slug'), 220), ''),
      coalesce((p_payload->>'sort_order')::integer, 0)
    ) returning id into v_id;
  else
    update public.achievements set
      title = left(trim(p_payload->>'title'), 180),
      description = nullif(left(coalesce(p_payload->>'description', ''), 3000), ''),
      image_url = v_cover,
      image_urls = v_images,
      placement = v_placement,
      achieved_on = nullif(p_payload->>'achieved_on', '')::date,
      status = coalesce(nullif(p_payload->>'status', ''), 'published'),
      featured = coalesce((p_payload->>'featured')::boolean, false),
      category = coalesce(nullif(left(trim(p_payload->>'category'), 80), ''), 'GENERAL'),
      publish_at = nullif(p_payload->>'publish_at', '')::timestamptz,
      slug = nullif(left(trim(p_payload->>'slug'), 220), ''),
      sort_order = coalesce((p_payload->>'sort_order')::integer, 0),
      updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  perform public.admin_log_activity(
    p_token,
    case when p_id is null then 'achievement_created' else 'achievement_updated' end,
    'achievement',
    v_id,
    coalesce(p_payload->>'title', 'Achievement')
  );
  return jsonb_build_object('ok', true, 'id', v_id);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'Unable to save achievement');
end
$function$;

create or replace function public.public_feature_data()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
select jsonb_build_object(
  'settings',(select jsonb_build_object(
    'club_name',s.club_name,'location',s.location,'slogan',s.slogan,
    'instagram',s.instagram,'whatsapp',s.whatsapp,'x_url',s.x_url,'facebook',s.facebook,
    'announcement_enabled',s.announcement_enabled,'announcement_text',s.announcement_text,'announcement_link',s.announcement_link,
    'contact_email',s.contact_email,'contact_phone',s.contact_phone,'contact_address',s.contact_address,
    'meta_title',s.meta_title,'meta_description',s.meta_description,'meta_image',s.meta_image,
    'history_intro',s.history_intro,'maintenance_mode',s.maintenance_mode
  ) from public.site_settings s where s.id=true),
  'achievements',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'title',a.title,'description',a.description,'image_url',a.image_url,
      'image_urls',a.image_urls,'placement',a.placement,
      'achieved_on',a.achieved_on,'status',a.status,'featured',a.featured,'category',a.category,
      'publish_at',a.publish_at,'slug',a.slug,'sort_order',a.sort_order
    ) order by a.featured desc,a.achieved_on desc nulls last,a.sort_order,a.created_at desc)
    from public.achievements a
    where a.status='published' and (a.publish_at is null or a.publish_at<=now())
  ),'[]'::jsonb),
  'history',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',h.id,'year_label',h.year_label,'title',h.title,'body',h.body,
      'image_url',h.image_url,'status',h.status,'sort_order',h.sort_order
    ) order by h.sort_order,h.year_label,h.created_at)
    from public.club_history h where h.status='published'
  ),'[]'::jsonb),
  'contact',jsonb_build_object(
    'email',(select contact_email from public.site_settings where id=true),
    'phone',(select contact_phone from public.site_settings where id=true),
    'address',(select contact_address from public.site_settings where id=true)
  )
)
$function$;