-- Personal one-time recovery keys for RoomHisaab cloud members.
-- The browser generates a high-entropy key and sends only its SHA-256 hash.
-- The plain key is shown to the member once and is never stored.

create table if not exists public.member_recovery_keys (
  member_id uuid primary key,
  room_id uuid not null,
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  key_hint text not null default '' check (length(key_hint) <= 8),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_recovery_keys_member_room_fk
    foreign key (room_id, member_id)
    references public.room_members(room_id, id)
    on delete cascade
);

create index if not exists member_recovery_keys_room_idx
  on public.member_recovery_keys(room_id);

alter table public.member_recovery_keys enable row level security;
revoke all on table public.member_recovery_keys from public, anon, authenticated;

create or replace function public.replace_my_recovery_key(
  p_room_id uuid,
  p_key_hash text,
  p_key_hint text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_room_member_id(p_room_id);
  v_hash text := lower(trim(coalesce(p_key_hash, '')));
begin
  if v_member_id is null then
    return jsonb_build_object('ok', false, 'error', 'Your active room membership was not found.');
  end if;
  if v_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'The recovery key could not be prepared safely.');
  end if;

  insert into public.member_recovery_keys(member_id, room_id, key_hash, key_hint)
  values (
    v_member_id,
    p_room_id,
    v_hash,
    right(regexp_replace(upper(coalesce(p_key_hint, '')), '[^A-Z0-9]', '', 'g'), 4)
  )
  on conflict (member_id) do update set
    room_id = excluded.room_id,
    key_hash = excluded.key_hash,
    key_hint = excluded.key_hint,
    failed_attempts = 0,
    locked_until = null,
    created_at = now(),
    updated_at = now();

  return jsonb_build_object('ok', true, 'member_id', v_member_id, 'created_at', now());
end;
$$;

create or replace function public.my_recovery_key_status(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_room_member_id(p_room_id);
  v record;
begin
  if v_member_id is null then
    return jsonb_build_object('ok', false, 'error', 'Your active room membership was not found.');
  end if;

  select key_hint, created_at, locked_until
    into v
  from public.member_recovery_keys
  where member_id = v_member_id and room_id = p_room_id;

  if not found then
    return jsonb_build_object('ok', true, 'has_key', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_key', true,
    'key_hint', v.key_hint,
    'created_at', v.created_at,
    'locked_until', v.locked_until
  );
end;
$$;

create or replace function public.recover_member_with_recovery_key(
  p_room_login_id text,
  p_old_username text,
  p_new_username text,
  p_room_password text,
  p_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_room_login text := lower(trim(coalesce(p_room_login_id, '')));
  v_old_username text := lower(trim(coalesce(p_old_username, '')));
  v_new_username text := lower(trim(coalesce(p_new_username, '')));
  v_key_hash text := lower(trim(coalesce(p_key_hash, '')));
  v_room record;
  v_member record;
  v_key record;
  v_room_hash text;
  v_room_ok boolean := false;
  v_key_ok boolean := false;
  v_previous uuid;
  v_email text;
  v_expected_email text;
  v_failures integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Create the new member login before using recovery.');
  end if;
  if v_old_username !~ '^[a-z0-9][a-z0-9._-]{1,39}$'
     or v_new_username !~ '^[a-z0-9][a-z0-9._-]{1,39}$'
     or v_key_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'Recovery details are invalid.');
  end if;
  if v_old_username = v_new_username then
    return jsonb_build_object('ok', false, 'error', 'Choose a new login username for the recovered account.');
  end if;

  select id, name, login_id
    into v_room
  from public.rooms
  where lower(login_id) = v_room_login and archived_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Recovery details are invalid.');
  end if;

  select email into v_email from auth.users where id = v_user;
  v_expected_email := v_new_username || '.' || v_room.login_id || '@members.roomhisaab.invalid';
  if lower(coalesce(v_email, '')) <> lower(v_expected_email) then
    return jsonb_build_object('ok', false, 'error', 'The new login does not match this recovery request.');
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = v_room.id and user_id = v_user and status = 'active' and not is_virtual
  ) then
    return jsonb_build_object('ok', false, 'error', 'This login is already an active member of the room.');
  end if;

  select *
    into v_member
  from public.room_members
  where room_id = v_room.id
    and lower(login_username) = v_old_username
    and status = 'active'
    and not is_virtual
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Recovery details are invalid.');
  end if;

  select *
    into v_key
  from public.member_recovery_keys
  where member_id = v_member.id and room_id = v_room.id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No recovery key is set for this member. Ask a room admin for a recovery invite.');
  end if;

  if v_key.locked_until is not null and v_key.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Recovery is temporarily locked after several failed attempts. Try again later.');
  end if;

  select password_hash into v_room_hash
  from public.room_secrets
  where room_id = v_room.id;

  v_room_ok := v_room_hash is not null
    and extensions.crypt(coalesce(p_room_password, ''), v_room_hash) = v_room_hash;
  v_key_ok := v_key.key_hash = v_key_hash;

  if not (v_room_ok and v_key_ok) then
    v_failures := coalesce(v_key.failed_attempts, 0) + 1;
    update public.member_recovery_keys set
      failed_attempts = case when v_failures >= 5 then 0 else v_failures end,
      locked_until = case when v_failures >= 5 then now() + interval '15 minutes' else locked_until end,
      updated_at = now()
    where member_id = v_member.id;
    return jsonb_build_object('ok', false, 'error', 'Recovery details are invalid.');
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = v_room.id
      and id <> v_member.id
      and login_username is not null
      and lower(login_username) = v_new_username
  ) then
    return jsonb_build_object('ok', false, 'error', 'The new username is already used in this room.');
  end if;

  begin
    v_previous := v_member.user_id;

    update public.room_members set
      user_id = v_user,
      login_username = v_new_username,
      status = 'active',
      claimed_at = now(),
      last_active_at = now(),
      previous_user_id = null
    where id = v_member.id;

    if v_previous is not null and v_previous <> v_user then
      update public.expenses
      set created_by_user_id = v_user
      where room_id = v_room.id
        and payer_member_id = v_member.id
        and created_by_user_id = v_previous;

      update public.recurring_expenses
      set created_by_user_id = v_user
      where room_id = v_room.id
        and payer_member_id = v_member.id
        and created_by_user_id = v_previous;

      update public.settlements
      set created_by_user_id = v_user
      where room_id = v_room.id
        and created_by_user_id = v_previous
        and v_member.id in (from_member_id, to_member_id);
    end if;

    insert into public.profiles(id, display_name, full_name, upi_id, phone, contact_email, preferred_upi_app, city, notes)
    select
      v_user,
      display_name,
      nullif(details->>'fullName', ''),
      nullif(lower(details->>'upiId'), ''),
      nullif(details->>'phone', ''),
      nullif(lower(details->>'email'), ''),
      coalesce(nullif(details->>'preferredUpiApp', ''), 'any'),
      nullif(details->>'city', ''),
      nullif(details->>'notes', '')
    from public.room_members
    where id = v_member.id
    on conflict (id) do update set display_name = excluded.display_name;

    -- One-time use: remove the spent recovery key only after transfer succeeds.
    delete from public.member_recovery_keys where member_id = v_member.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'The new login could not be connected to this member.');
  end;

  return jsonb_build_object(
    'ok', true,
    'room_id', v_room.id,
    'room_login_id', v_room.login_id,
    'member_id', v_member.id,
    'username', v_new_username
  );
end;
$$;

revoke all on function public.replace_my_recovery_key(uuid, text, text) from public, anon;
revoke all on function public.my_recovery_key_status(uuid) from public, anon;
revoke all on function public.recover_member_with_recovery_key(text, text, text, text, text) from public, anon;

grant execute on function public.replace_my_recovery_key(uuid, text, text) to authenticated;
grant execute on function public.my_recovery_key_status(uuid) to authenticated;
grant execute on function public.recover_member_with_recovery_key(text, text, text, text, text) to authenticated;
