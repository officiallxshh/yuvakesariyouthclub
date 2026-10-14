-- Leader-controlled QR check-in for approved YYC members.
-- QR codes contain short-lived random tokens; only token hashes are stored.

create table public.attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  leader_id uuid not null references public.leaders(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint attendance_qr_sessions_expiry_check check (expires_at > created_at)
);

create unique index attendance_qr_sessions_one_live_event_idx
  on public.attendance_qr_sessions(event_id)
  where ended_at is null;

create index attendance_qr_sessions_leader_live_idx
  on public.attendance_qr_sessions(leader_id, expires_at)
  where ended_at is null;

create table public.attendance_qr_tokens (
  token_hash text primary key,
  session_id uuid not null references public.attendance_qr_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint attendance_qr_tokens_expiry_check check (expires_at > created_at)
);

create index attendance_qr_tokens_session_expiry_idx
  on public.attendance_qr_tokens(session_id, expires_at);

alter table public.attendance_qr_sessions enable row level security;
alter table public.attendance_qr_tokens enable row level security;

revoke all on table public.attendance_qr_sessions from public, anon, authenticated;
revoke all on table public.attendance_qr_tokens from public, anon, authenticated;

create or replace function public.leader_start_attendance_qr(
  p_token text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_leader_id uuid;
  v_session public.attendance_qr_sessions;
  v_event_title text;
  v_code text;
begin
  v_leader_id := public._leader_id(p_token);
  if v_leader_id is null then
    return jsonb_build_object('ok',false,'error_code','LEADER_SESSION_EXPIRED','error','Leader session expired. Please sign in again.');
  end if;

  if not exists (
    select 1 from public.leaders l
    where l.id=v_leader_id and lower(coalesce(l.status,'active'))='active'
  ) then
    return jsonb_build_object('ok',false,'error_code','LEADER_NOT_ACTIVE','error','Active leader access is required.');
  end if;

  select e.title into v_event_title
  from public.events e
  where e.id=p_event_id
    and lower(coalesce(e.status,'published'))='published'
    and e.event_date is not null
    and e.event_date>=current_date
    and (e.publish_at is null or e.publish_at<=now());

  if not found then
    return jsonb_build_object('ok',false,'error_code','EVENT_NOT_AVAILABLE','error','Choose a published upcoming event.');
  end if;

  delete from public.attendance_qr_tokens t
   where t.expires_at<=now()
      or exists (
        select 1 from public.attendance_qr_sessions s
        where s.id=t.session_id
          and (s.ended_at is not null or s.expires_at<=now())
      );

  -- A closed or expired check-in cannot block a new one for the same event.
  update public.attendance_qr_sessions
     set ended_at=now()
   where event_id=p_event_id
     and ended_at is null
     and expires_at<=now();

  select * into v_session
    from public.attendance_qr_sessions s
   where s.event_id=p_event_id and s.ended_at is null
   for update;

  if found then
    if v_session.leader_id<>v_leader_id then
      return jsonb_build_object('ok',false,'error_code','CHECKIN_ALREADY_ACTIVE','error','Another leader already has check-in open for this event. Ask them to end it first.');
    end if;
    update public.attendance_qr_sessions
       set expires_at=now()+interval '15 minutes'
     where id=v_session.id
     returning * into v_session;
  else
    insert into public.attendance_qr_sessions(event_id,leader_id,expires_at)
    values(p_event_id,v_leader_id,now()+interval '15 minutes')
    returning * into v_session;
  end if;

  delete from public.attendance_qr_tokens t
   where t.session_id=v_session.id and t.expires_at<=now();

  v_code := encode(gen_random_bytes(32),'hex');
  insert into public.attendance_qr_tokens(session_id,token_hash,expires_at)
  values(v_session.id,public._hash_token(v_code),least(now()+interval '2 minutes',v_session.expires_at));

  return jsonb_build_object(
    'ok',true,
    'session_id',v_session.id,
    'qr_token',v_code,
    'event_title',v_event_title,
    'session_expires_at',v_session.expires_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error_code','CHECKIN_ALREADY_ACTIVE','error','Another leader just opened check-in for this event. Refresh and try again.');
  when others then
    return jsonb_build_object('ok',false,'error_code','CHECKIN_START_FAILED','error','Unable to start QR check-in. Please try again.');
end
$function$;

create or replace function public.leader_refresh_attendance_qr(
  p_token text,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_leader_id uuid;
  v_session public.attendance_qr_sessions;
  v_code text;
begin
  v_leader_id := public._leader_id(p_token);
  if v_leader_id is null then
    return jsonb_build_object('ok',false,'error_code','LEADER_SESSION_EXPIRED','error','Leader session expired. Please sign in again.');
  end if;

  select * into v_session
    from public.attendance_qr_sessions s
   where s.id=p_session_id
     and s.leader_id=v_leader_id
     and s.ended_at is null
     and s.expires_at>now()
   for update;

  if not found then
    return jsonb_build_object('ok',false,'error_code','CHECKIN_SESSION_CLOSED','error','This check-in session has ended. Start a new QR check-in.');
  end if;

  update public.attendance_qr_sessions
     set expires_at=now()+interval '15 minutes'
   where id=v_session.id
   returning * into v_session;

  delete from public.attendance_qr_tokens t
   where t.session_id=v_session.id and t.expires_at<=now();

  v_code := encode(gen_random_bytes(32),'hex');
  insert into public.attendance_qr_tokens(session_id,token_hash,expires_at)
  values(v_session.id,public._hash_token(v_code),least(now()+interval '2 minutes',v_session.expires_at));

  return jsonb_build_object('ok',true,'qr_token',v_code,'session_expires_at',v_session.expires_at);
exception when others then
  return jsonb_build_object('ok',false,'error_code','CHECKIN_REFRESH_FAILED','error','Unable to refresh the QR code. Please try again.');
end
$function$;

create or replace function public.leader_close_attendance_qr(
  p_token text,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_leader_id uuid;
begin
  v_leader_id := public._leader_id(p_token);
  if v_leader_id is null then
    return jsonb_build_object('ok',false,'error_code','LEADER_SESSION_EXPIRED','error','Leader session expired. Please sign in again.');
  end if;

  update public.attendance_qr_sessions s
     set ended_at=coalesce(s.ended_at,now())
   where s.id=p_session_id and s.leader_id=v_leader_id;

  if not found then
    return jsonb_build_object('ok',false,'error_code','CHECKIN_SESSION_NOT_FOUND','error','Check-in session was not found.');
  end if;

  delete from public.attendance_qr_tokens t where t.session_id=p_session_id;
  return jsonb_build_object('ok',true);
exception when others then
  return jsonb_build_object('ok',false,'error_code','CHECKIN_CLOSE_FAILED','error','Unable to end QR check-in. Please try again.');
end
$function$;

create or replace function public.member_mark_attendance_qr(
  p_token text,
  p_session_id uuid,
  p_qr_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_member_id uuid;
  v_event_id uuid;
  v_event_title text;
  v_attendance_marked boolean;
begin
  v_member_id := public._member_id(p_token);
  if v_member_id is null then
    return jsonb_build_object('ok',false,'error_code','MEMBER_SESSION_EXPIRED','error','Member session expired. Sign in and scan the QR again.');
  end if;

  if not exists (
    select 1 from public.members m
    where m.id=v_member_id
      and m.approved is true
      and lower(coalesce(m.status,'approved'))='approved'
  ) then
    return jsonb_build_object('ok',false,'error_code','MEMBER_NOT_APPROVED','error','Approved member access is required to mark attendance.');
  end if;

  if p_qr_token is null or length(p_qr_token)<>64 or p_qr_token !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('ok',false,'error_code','QR_EXPIRED_OR_INVALID','error','This QR has expired or is invalid. Ask a leader to show a fresh code.');
  end if;

  select s.event_id,e.title into v_event_id,v_event_title
    from public.attendance_qr_sessions s
    join public.events e on e.id=s.event_id
   where s.id=p_session_id
     and s.ended_at is null
     and s.expires_at>now()
     and lower(coalesce(e.status,'published'))='published'
     and e.event_date is not null
     and e.event_date>=current_date
     and (e.publish_at is null or e.publish_at<=now())
     and exists (
       select 1 from public.attendance_qr_tokens t
       where t.session_id=s.id
         and t.token_hash=public._hash_token(p_qr_token)
         and t.expires_at>now()
     );

  if not found then
    return jsonb_build_object('ok',false,'error_code','QR_EXPIRED_OR_INVALID','error','This QR has expired or check-in has ended. Ask a leader to show a fresh code.');
  end if;

  insert into public.attendance(member_id,event_id,present,marked_at)
  values(v_member_id,v_event_id,true,now())
  on conflict (member_id,event_id)
    where member_id is not null and event_id is not null
  do update set present=true,marked_at=now()
    where public.attendance.present is distinct from true
  returning true into v_attendance_marked;

  return jsonb_build_object(
    'ok',true,
    'already_marked',v_attendance_marked is null,
    'event_id',v_event_id,
    'event_title',v_event_title
  );
exception when others then
  return jsonb_build_object('ok',false,'error_code','ATTENDANCE_SAVE_FAILED','error','Could not mark attendance. Please try again or ask a leader for help.');
end
$function$;

revoke all on function public.leader_start_attendance_qr(text,uuid) from public;
revoke all on function public.leader_refresh_attendance_qr(text,uuid) from public;
revoke all on function public.leader_close_attendance_qr(text,uuid) from public;
revoke all on function public.member_mark_attendance_qr(text,uuid,text) from public;

grant execute on function public.leader_start_attendance_qr(text,uuid) to anon, authenticated;
grant execute on function public.leader_refresh_attendance_qr(text,uuid) to anon, authenticated;
grant execute on function public.leader_close_attendance_qr(text,uuid) to anon, authenticated;
grant execute on function public.member_mark_attendance_qr(text,uuid,text) to anon, authenticated;
