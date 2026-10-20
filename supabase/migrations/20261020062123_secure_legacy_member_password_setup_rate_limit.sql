-- Protect legacy member password setup with the existing 8-attempt / 15-minute limiter.
-- Preserve current login and password setup RPC signatures and result shapes.
alter table public.yyc_login_attempts
  drop constraint if exists yyc_login_attempts_kind_check;
alter table public.yyc_login_attempts
  add constraint yyc_login_attempts_kind_check
  check (kind in ('member', 'leader', 'admin', 'member_reset'));

CREATE OR REPLACE FUNCTION public._yyc_login_allow(p_kind text, p_identifier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  h text := encode(digest(lower(trim(coalesce(p_identifier,''))), 'sha256'), 'hex');
  r public.yyc_login_attempts;
  now_ts timestamptz := now();
begin
  if h='' or p_kind not in ('member','leader','admin','member_reset') then
    return jsonb_build_object('allowed',false,'retry_after',60);
  end if;
  select * into r from public.yyc_login_attempts where kind=p_kind and identifier_hash=h for update;
  if not found then
    insert into public.yyc_login_attempts(kind,identifier_hash,attempts,window_started_at,updated_at)
    values(p_kind,h,0,now_ts,now_ts);
    return jsonb_build_object('allowed',true,'retry_after',0);
  end if;
  if r.blocked_until is not null and r.blocked_until>now_ts then
    return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from (r.blocked_until-now_ts))/60.0)::int));
  end if;
  if r.window_started_at < now_ts-interval '15 minutes' then
    update public.yyc_login_attempts set attempts=0,window_started_at=now_ts,blocked_until=null,updated_at=now_ts where id=r.id;
  end if;
  return jsonb_build_object('allowed',true,'retry_after',0);
end;
$function$;

CREATE OR REPLACE FUNCTION public._yyc_login_fail(p_kind text, p_identifier text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  h text := encode(digest(lower(trim(coalesce(p_identifier,''))), 'sha256'), 'hex');
  r public.yyc_login_attempts;
  a integer;
begin
  if h='' or p_kind not in ('member','leader','admin','member_reset') then return; end if;
  select * into r from public.yyc_login_attempts where kind=p_kind and identifier_hash=h for update;
  if not found then
    insert into public.yyc_login_attempts(kind,identifier_hash,attempts,window_started_at,updated_at)
    values(p_kind,h,1,now(),now());
    return;
  end if;
  if r.window_started_at < now()-interval '15 minutes' then
    a:=1;
  else
    a:=r.attempts+1;
  end if;
  update public.yyc_login_attempts
  set attempts=a,
      window_started_at=case when r.window_started_at < now()-interval '15 minutes' then now() else r.window_started_at end,
      blocked_until=case when a>=8 then now()+interval '15 minutes' else null end,
      updated_at=now()
  where id=r.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public._yyc_login_success(p_kind text, p_identifier text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare h text := encode(digest(lower(trim(coalesce(p_identifier,''))), 'sha256'), 'hex');
begin
  if h='' or p_kind not in ('member','leader','admin','member_reset') then return; end if;
  delete from public.yyc_login_attempts where kind=p_kind and identifier_hash=h;
end;
$function$;

CREATE OR REPLACE FUNCTION public.member_legacy_set_password(p_email text, p_dob date, p_phone_last4 text, p_new_password text, p_device_name text DEFAULT 'Unknown device'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  m public.members;
  raw text;
  gate jsonb;
  email_norm text := lower(trim(coalesce(p_email,'')));
  phone4 text := regexp_replace(coalesce(p_phone_last4,''),'[^0-9]','','g');
  device text := left(nullif(trim(coalesce(p_device_name,'')),''),120);
begin
  if device is null then device := 'Unknown device'; end if;

  if email_norm='' or p_dob is null or length(phone4)<>4 then
    return jsonb_build_object('ok',false,'error','Enter email, date of birth and the last 4 digits of your phone number');
  end if;

  if length(coalesce(p_new_password,''))<8 then
    return jsonb_build_object('ok',false,'error','New password must be at least 8 characters');
  end if;

  gate := public._yyc_login_allow('member_reset', email_norm);
  if coalesce((gate->>'allowed')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'error', 'Too many password setup attempts. Please try again in ' || coalesce(gate->>'retry_after', '15') || ' minute(s).');
  end if;

  select * into m
  from public.members
  where lower(coalesce(email,''))=email_norm
    and coalesce(status,case when approved then 'approved' else 'pending' end)='approved'
  order by created_at desc
  limit 1;

  if not found then
    perform public._yyc_login_fail('member_reset', email_norm);
    return jsonb_build_object('ok',false,'error','No approved YYC member account found for that email');
  end if;

  if coalesce(m.dob::text,'')<>p_dob::text
     or right(regexp_replace(coalesce(m.phone,''),'[^0-9]','','g'),4)<>phone4 then
    perform public._yyc_login_fail('member_reset',email_norm);
    return jsonb_build_object('ok',false,'error','The account details could not be verified');
  end if;

  if coalesce(m.password_hash,'')<>'' then
    perform public._yyc_login_fail('member_reset', email_norm);
    return jsonb_build_object('ok',false,'error','This account already has a password. Please use normal Member Login or contact YYC administration.');
  end if;

  update public.members
  set password_hash=crypt(p_new_password,gen_salt('bf',10))
  where id=m.id;

  perform public._yyc_login_success('member_reset', email_norm);

  raw:=encode(gen_random_bytes(32),'hex');
  insert into public.member_sessions(token_hash,member_id,expires_at,device_name,last_seen_at)
  values(public._hash_token(raw),m.id,null,device,now());

  return jsonb_build_object(
    'ok',true,
    'token',raw,
    'member',jsonb_build_object(
      'id',m.id,'role_number',m.role_number,'name',m.name,'dob',m.dob,
      'phone',m.phone,'email',m.email,'club_name',m.club_name,'position',m.position,
      'photo_url',m.photo_url,'photo_scale',m.photo_scale,
      'photo_pos_x',m.photo_pos_x,'photo_pos_y',m.photo_pos_y
    )
  );
end
$function$;
