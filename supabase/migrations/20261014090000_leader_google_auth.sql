-- Allow a verified Google identity to start a YYC leader session only when its
-- verified email matches exactly one active leader record.
create or replace function public.leader_login_verified_identity(p_device_name text default 'Google leader sign-in')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_user auth.users;
  v_leader public.leaders;
  v_email text;
  v_match_count integer := 0;
  v_raw_token text;
  v_device text := left(nullif(trim(coalesce(p_device_name,'')),''),120);
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error_code','AUTH_REQUIRED','error','Sign in with Google first.');
  end if;

  select * into v_user from auth.users where id=auth.uid();
  if not found
     or coalesce(v_user.raw_app_meta_data->>'provider','') <> 'google'
     or v_user.email_confirmed_at is null
     or nullif(trim(v_user.email),'') is null then
    return jsonb_build_object('ok',false,'error_code','IDENTITY_NOT_VERIFIED','error','Use a verified Google account.');
  end if;

  v_email := lower(trim(v_user.email));
  select count(*) into v_match_count
    from public.leaders l
   where lower(trim(coalesce(l.email,'')))=v_email
     and coalesce(l.status,'active')='active';

  if v_match_count <> 1 then
    return jsonb_build_object('ok',false,'error_code','LEADER_NOT_MATCHED','error','This Google email must match exactly one active leader account. Contact YYC administration to update the leader email.');
  end if;

  select * into v_leader
    from public.leaders l
   where lower(trim(coalesce(l.email,'')))=v_email
     and coalesce(l.status,'active')='active'
   limit 1;

  if v_device is null then v_device := 'Google leader sign-in'; end if;
  v_raw_token := encode(gen_random_bytes(32),'hex');
  insert into public.leader_sessions(token_hash,leader_id,expires_at,device_name,last_seen_at)
  values(public._hash_token(v_raw_token),v_leader.id,null,v_device,now());

  return jsonb_build_object(
    'ok',true,'token',v_raw_token,
    'leader',jsonb_build_object(
      'id',v_leader.id,'role_number',v_leader.role_number,'name',v_leader.name,'role',v_leader.role,
      'line',v_leader.line,'phone',v_leader.phone,'email',v_leader.email,'photo_url',v_leader.photo_url,
      'photo_scale',v_leader.photo_scale,'photo_pos_x',v_leader.photo_pos_x,'photo_pos_y',v_leader.photo_pos_y,
      'status',coalesce(v_leader.status,'active')
    ),
    'expires_at',null
  );
end
$function$;

revoke all on function public.leader_login_verified_identity(text) from public, anon;
grant execute on function public.leader_login_verified_identity(text) to authenticated;
