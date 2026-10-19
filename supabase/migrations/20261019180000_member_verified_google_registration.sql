-- Verified Google-only member registration. The applicant remains pending admin approval.
create or replace function public.member_register_verified_google(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_user auth.users;
  v_member public.members;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_name text;
  v_dob date;
  v_dob_text text;
  v_photo text;
  v_position text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','Please continue with Google again before submitting your application.');
  end if;

  select * into v_user from auth.users where id=auth.uid();
  if not found
     or coalesce(v_user.raw_app_meta_data->>'provider','') <> 'google'
     or v_user.email_confirmed_at is null
     or nullif(trim(v_user.email),'') is null then
    return jsonb_build_object('ok',false,'error','A verified Google email is required for this registration method.');
  end if;

  if nullif(trim(coalesce(p_payload->>'website','')),'') is not null then
    return jsonb_build_object('ok',false,'error','Unable to process application');
  end if;

  v_email := lower(trim(v_user.email));
  if nullif(trim(coalesce(p_payload->>'email','')),'') is not null
     and lower(trim(p_payload->>'email')) <> v_email then
    return jsonb_build_object('ok',false,'error','The registration email must match your verified Google account.');
  end if;

  v_name := nullif(trim(coalesce(p_payload->>'name', v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name','')),'');
  if v_name is null then
    return jsonb_build_object('ok',false,'error','Full name is required.');
  end if;

  v_dob_text := nullif(trim(coalesce(p_payload->>'dob','')),'');
  if v_dob_text is null then
    return jsonb_build_object('ok',false,'error','Date of birth is required.');
  end if;
  begin
    v_dob := v_dob_text::date;
  exception when others then
    return jsonb_build_object('ok',false,'error','Enter a valid date of birth.');
  end;
  if v_dob > current_date then
    return jsonb_build_object('ok',false,'error','Date of birth cannot be in the future.');
  end if;

  v_phone := nullif(trim(coalesce(p_payload->>'phone','')),'');
  v_phone_digits := regexp_replace(coalesce(v_phone,''),'[^0-9]','','g');
  if length(v_phone_digits) < 7 then
    return jsonb_build_object('ok',false,'error','Enter a valid phone number.');
  end if;

  v_photo := nullif(trim(coalesce(p_payload->>'photo_data','')),'');
  if v_photo is null or v_photo !~ '^https://' then
    return jsonb_build_object('ok',false,'error','Choose a member photo or use the available Google profile photo.');
  end if;

  if exists(
    select 1 from public.members
    where lower(trim(email))=v_email
      and coalesce(status,'pending') not in ('denied','duplicate')
  ) then
    return jsonb_build_object('ok',false,'error','An active YYC member account already exists with this email. Please use the existing member login.');
  end if;

  if exists(
    select 1 from public.members
    where regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_phone_digits
      and coalesce(status,'pending') not in ('denied','duplicate')
  ) then
    return jsonb_build_object('ok',false,'error','An active YYC member account already exists with this phone number. Please use the existing member login.');
  end if;

  v_position := coalesce(nullif(trim(coalesce(p_payload->>'position','')),''),'MEMBER');

  insert into public.members(
    name,dob,phone,email,club_name,position,photo_url,password_hash,
    role_number,status,photo_scale,photo_pos_x,photo_pos_y,approved,duplicate_of
  )
  values(
    v_name,v_dob,v_phone,v_email,
    'Yuvakesari Youth Club',v_position,v_photo,null,
    null,'pending',1,50,50,false,null
  )
  returning * into v_member;

  return jsonb_build_object(
    'ok',true,
    'member',jsonb_build_object(
      'id',v_member.id,
      'name',v_member.name,
      'email',v_member.email,
      'status',v_member.status,
      'approved',v_member.approved
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error','An active YYC member account already exists with this email or phone number. Please use the existing member login.');
  when others then
    return jsonb_build_object('ok',false,'error','Could not submit the membership application. Please check the details and try again.');
end;
$function$;

revoke all on function public.member_register_verified_google(jsonb) from public, anon;
grant execute on function public.member_register_verified_google(jsonb) to authenticated;
