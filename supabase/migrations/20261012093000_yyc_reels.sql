create table if not exists public.yyc_reels (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  caption text not null default '',
  category text not null default 'Community',
  video_url text not null,
  video_path text not null,
  thumbnail_url text not null default '',
  thumbnail_path text not null default '',
  status text not null default 'draft' check (status in ('published','draft','hidden')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yyc_reels_title_length check (char_length(title) between 1 and 140),
  constraint yyc_reels_caption_length check (char_length(caption) <= 2400)
);
alter table public.yyc_reels enable row level security;
revoke all on table public.yyc_reels from public, anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yyc-reels', 'yyc-reels', true, 52428800, array['video/*','image/*'])
on conflict (id) do update
set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create or replace function public.yyc_reels_public_list()
returns jsonb language sql stable security definer set search_path = public
as $function$
  select jsonb_build_object('ok', true, 'reels', coalesce(
    jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'caption',r.caption,'category',r.category,'video_url',r.video_url,'thumbnail_url',r.thumbnail_url,'status',r.status,'sort_order',r.sort_order,'created_at',r.created_at) order by r.sort_order asc,r.created_at desc),
    '[]'::jsonb))
  from public.yyc_reels r where r.status='published';
$function$;
create or replace function public.yyc_reels_admin_authorized(p_token text)
returns jsonb language sql security definer set search_path = public
as $function$ select jsonb_build_object('ok',coalesce(public._admin_ok(p_token),false)); $function$;
create or replace function public.yyc_reels_admin_list(p_token text)
returns jsonb language plpgsql security definer set search_path = public
as $function$
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  return jsonb_build_object('ok',true,'reels',coalesce((select jsonb_agg(to_jsonb(r) order by r.sort_order asc,r.created_at desc) from public.yyc_reels r),'[]'::jsonb));
end;
$function$;
create or replace function public.yyc_reels_admin_save(
  p_token text,p_id uuid,p_title text,p_caption text,p_category text,p_video_url text,p_video_path text,p_thumbnail_url text,p_thumbnail_path text,p_status text,p_sort_order integer
)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  v public.yyc_reels;
  v_status text := lower(coalesce(nullif(trim(p_status),''),'draft'));
  v_title text := trim(coalesce(p_title,''));
  v_video_url text := trim(coalesce(p_video_url,''));
  v_video_path text := trim(coalesce(p_video_path,''));
  v_thumbnail_url text := trim(coalesce(p_thumbnail_url,''));
  v_thumbnail_path text := trim(coalesce(p_thumbnail_path,''));
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  if v_title='' or char_length(v_title)>140 then return jsonb_build_object('ok',false,'error','Enter a title of 1–140 characters.'); end if;
  if char_length(coalesce(p_caption,''))>2400 then return jsonb_build_object('ok',false,'error','Caption is too long (maximum 2400 characters).'); end if;
  if v_status not in ('published','draft','hidden') then return jsonb_build_object('ok',false,'error','Invalid publication status.'); end if;
  if v_video_path not like 'reels/video/%' or v_video_url not like 'https://vrllozfzheikjbhxvpkx.supabase.co/storage/v1/object/public/yyc-reels/reels/video/%' then
    return jsonb_build_object('ok',false,'error','Upload the video through the REEL Studio first.');
  end if;
  if v_thumbnail_path<>'' and (v_thumbnail_path not like 'reels/thumbnail/%' or v_thumbnail_url not like 'https://vrllozfzheikjbhxvpkx.supabase.co/storage/v1/object/public/yyc-reels/reels/thumbnail/%') then
    return jsonb_build_object('ok',false,'error','Thumbnail upload could not be verified.');
  end if;
  if p_id is null then
    insert into public.yyc_reels(title,caption,category,video_url,video_path,thumbnail_url,thumbnail_path,status,sort_order,updated_at)
    values(v_title,coalesce(p_caption,''),coalesce(nullif(trim(p_category),''),'Community'),v_video_url,v_video_path,v_thumbnail_url,v_thumbnail_path,v_status,coalesce(p_sort_order,0),now())
    returning * into v;
    perform public.admin_log_activity(p_token,case when v_status='published' then 'published' else 'created' end,'reel',v.id,v.title);
  else
    update public.yyc_reels set title=v_title,caption=coalesce(p_caption,''),category=coalesce(nullif(trim(p_category),''),'Community'),
      video_url=v_video_url,video_path=v_video_path,thumbnail_url=v_thumbnail_url,thumbnail_path=v_thumbnail_path,status=v_status,
      sort_order=coalesce(p_sort_order,0),updated_at=now()
    where id=p_id returning * into v;
    if not found then return jsonb_build_object('ok',false,'error','REEL not found.'); end if;
    perform public.admin_log_activity(p_token,case when v_status='published' then 'updated_published' else 'updated' end,'reel',v.id,v.title);
  end if;
  return jsonb_build_object('ok',true,'reel',to_jsonb(v));
end;
$function$;
create or replace function public.yyc_reels_admin_delete(p_token text,p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare v public.yyc_reels;
begin
  if not public._admin_ok(p_token) then return jsonb_build_object('ok',false,'error','Unauthorized'); end if;
  delete from public.yyc_reels where id=p_id returning * into v;
  if not found then return jsonb_build_object('ok',false,'error','REEL not found.'); end if;
  perform public.admin_log_activity(p_token,'deleted','reel',v.id,v.title);
  return jsonb_build_object('ok',true,'id',v.id,'video_path',v.video_path,'thumbnail_path',v.thumbnail_path);
end;
$function$;
revoke all on function public.yyc_reels_public_list() from public;
revoke all on function public.yyc_reels_admin_authorized(text) from public;
revoke all on function public.yyc_reels_admin_list(text) from public;
revoke all on function public.yyc_reels_admin_save(text,uuid,text,text,text,text,text,text,text,text,integer) from public;
revoke all on function public.yyc_reels_admin_delete(text,uuid) from public;
grant execute on function public.yyc_reels_public_list() to anon,authenticated,service_role;
grant execute on function public.yyc_reels_admin_authorized(text) to anon,authenticated,service_role;
grant execute on function public.yyc_reels_admin_list(text) to anon,authenticated,service_role;
grant execute on function public.yyc_reels_admin_save(text,uuid,text,text,text,text,text,text,text,text,integer) to anon,authenticated,service_role;
grant execute on function public.yyc_reels_admin_delete(text,uuid) to anon,authenticated,service_role;