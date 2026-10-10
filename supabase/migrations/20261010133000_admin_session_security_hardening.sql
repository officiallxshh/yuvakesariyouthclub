-- YYC admin login hardening.
-- Admin browser sessions are tab-scoped; server-side sessions expire after 8 hours.
-- A NULL password must always fail even when the caller bypasses HTML form validation.

create or replace function public._admin_ok(p_token text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(p_token, '') <> ''
     and exists (
       select 1
       from public.admin_sessions
       where token_hash = public._hash_token(p_token)
         and expires_at is not null
         and expires_at > now()
     )
$function$;

create or replace function public.admin_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  u public.admin_users;
  raw text;
  gate jsonb;
  session_expiry timestamptz;
begin
  gate := public._yyc_login_allow('admin', p_username);
  if coalesce((gate->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'ok', false,
      'error', 'Too many login attempts. Please try again in ' || coalesce(gate->>'retry_after', '15') || ' minute(s).'
    );
  end if;

  if coalesce(trim(p_username), '') = '' or p_password is null or p_password = '' then
    perform public._yyc_login_fail('admin', p_username);
    return jsonb_build_object('ok', false, 'error', 'Invalid admin credentials');
  end if;

  select * into u
  from public.admin_users
  where username = lower(trim(p_username));

  if not found
     or u.password_hash is null
     or crypt(p_password, u.password_hash) is distinct from u.password_hash then
    perform public._yyc_login_fail('admin', p_username);
    return jsonb_build_object('ok', false, 'error', 'Invalid admin credentials');
  end if;

  perform public._yyc_login_success('admin', p_username);

  raw := encode(gen_random_bytes(32), 'hex');
  session_expiry := now() + interval '8 hours';

  delete from public.admin_sessions
  where expires_at is not null and expires_at <= now();

  insert into public.admin_sessions(token_hash, username, expires_at)
  values (public._hash_token(raw), u.username, session_expiry);

  return jsonb_build_object(
    'ok', true,
    'token', raw,
    'username', u.username,
    'expires_at', session_expiry
  );
end
$function$;

-- Give sessions that were previously non-expiring a short transition window.
update public.admin_sessions
set expires_at = now() + interval '8 hours'
where expires_at is null;
