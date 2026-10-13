-- Adds a verified Supabase Auth identity bridge for approved YYC member accounts.
-- The browser never supplies a member ID or role; the authenticated identity must
-- carry a verified Google email or verified phone that matches exactly one approved member.
create or replace function public.member_login_verified_identity(p_device_name text default 'Verified sign-in')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_user auth.users;
  v_member public.members;
  v_provider text;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_match_count integer := 0;
  v_raw_token text;
  v_device text := left(nullif(trim(coalesce(p_device_name,'')),''),120);
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error_code','AUTH_REQUIRED','error','Sign in with Google or a verified phone number first.');
  end if;

  select * into v_user from auth.users where id=auth.uid();
  if not found then
    return jsonb_build_object('ok',false,'error_code','AUTH_REQUIRED','error','Verified sign-in is required.');
  end if;

  v_provider := coalesce(v_user.raw_app_meta_data->>'provider','');
  if v_provider='google' and v_user.email_confirmed_at is not null and nullif(trim(v_user.email),'') is not null then
    v_email := lower(trim(v_user.email));
    select count(*) into v_match_count
      from public.members m
     where lower(trim(coalesce(m.email,'')))=v_email
       and m.approved is true
       and coalesce(m.status,'approved')='approved';
  elsif v_provider='phone' and v_user.phone_confirmed_at is not null and nullif(trim(v_user.phone),'') is not null then
    v_phone_digits := regexp_replace(v_user.phone,'[^0-9]','','g');
    select count(*) into v_match_count
      from public.members m
     where (
       regexp_replace(coalesce(m.phone,''),'[^0-9]','','g')=v_phone_digits
       or (left(v_phone_digits,2)='91'
           and length(regexp_replace(coalesce(m.phone,''),'[^0-9]','','g'))=10
           and right(v_phone_digits,10)=regexp_replace(coalesce(m.phone,''),'[^0-9]','','g'))
     )
       and m.approved is true
       and coalesce(m.status,'approved')='approved';
  else
    return jsonb_build_object('ok',false,'error_code','IDENTITY_NOT_VERIFIED','error','Use a verified Google email or phone number.');
  end if;

  if v_match_count<>1 then
    return jsonb_build_object('ok',false,'error_code','MEMBER_NOT_MATCHED','error','This verified account does not match one approved YYC member. Contact YYC administration to update your registered contact details.');
  end if;

  if v_provider='google' then
    select * into v_member from public.members m
     where lower(trim(coalesce(m.email,'')))=v_email
       and m.approved is true and coalesce(m.status,'approved')='approved'
     limit 1;
  else
    select * into v_member from public.members m
     where (
       regexp_replace(coalesce(m.phone,''),'[^0-9]','','g')=v_phone_digits
       or (left(v_phone_digits,2)='91'
           and length(regexp_replace(coalesce(m.phone,''),'[^0-9]','','g'))=10
           and right(v_phone_digits,10)=regexp_replace(coalesce(m.phone,''),'[^0-9]','','g'))
     )
       and m.approved is true and coalesce(m.status,'approved')='approved'
     limit 1;
  end if;

  if v_device is null then v_device := 'Verified sign-in'; end if;
  v_raw_token := encode(gen_random_bytes(32),'hex');
  insert into public.member_sessions(token_hash,member_id,expires_at,device_name,last_seen_at)
  values(public._hash_token(v_raw_token),v_member.id,null,v_device,now());

  return jsonb_build_object(
    'ok',true,'token',v_raw_token,
    'member',jsonb_build_object(
      'id',v_member.id,'role_number',v_member.role_number,'name',v_member.name,
      'dob',v_member.dob,'phone',v_member.phone,'email',v_member.email,
      'club_name',v_member.club_name,'position',v_member.position,
      'photo_url',v_member.photo_url,'photo_scale',v_member.photo_scale,
      'photo_pos_x',v_member.photo_pos_x,'photo_pos_y',v_member.photo_pos_y
    )
  );
end
$function$;

revoke all on function public.member_login_verified_identity(text) from public, anon;
grant execute on function public.member_login_verified_identity(text) to authenticated;
