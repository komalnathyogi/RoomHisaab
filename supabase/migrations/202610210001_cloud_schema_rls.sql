-- RoomHisaab cloud schema + RLS
-- Existing public.profiles / public.rooms / public.room_members tables are extended.
-- Financial writes are owner-bound: an expense can be changed only by the
-- authenticated user who owns the payer membership. Room members can read the
-- complete room activity.

create extension if not exists pgcrypto with schema extensions;

-- ── Updated-at helper ────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Profiles: app preferences + non-secret contact preferences ──
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists contact_email text,
  add column if not exists preferred_upi_app text not null default 'any',
  add column if not exists city text,
  add column if not exists notes text,
  add column if not exists app_preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_preferred_upi_app_check;
alter table public.profiles
  add constraint profiles_preferred_upi_app_check
  check (preferred_upi_app in ('any','gpay','phonepe','paytm','bhim'));

-- ── Rooms: login id + cycle settings ───────────────────────
alter table public.rooms
  add column if not exists login_id text,
  add column if not exists rent_cycle_day smallint not null default 1,
  add column if not exists cycle_mode text not null default 'monthly',
  add column if not exists cycle_start timestamptz,
  add column if not exists cycle_end timestamptz,
  add column if not exists legacy_local_id text,
  add column if not exists settings jsonb not null default '{}'::jsonb;

update public.rooms
set login_id = 'room-' || lower(invite_code)
where login_id is null;

alter table public.rooms
  alter column login_id set not null,
  drop constraint if exists rooms_login_id_format_check,
  drop constraint if exists rooms_rent_cycle_day_check,
  drop constraint if exists rooms_cycle_mode_check,
  drop constraint if exists rooms_cycle_range_check;

alter table public.rooms
  add constraint rooms_login_id_format_check check (login_id ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  add constraint rooms_rent_cycle_day_check check (rent_cycle_day between 1 and 28),
  add constraint rooms_cycle_mode_check check (cycle_mode in ('monthly','custom')),
  add constraint rooms_cycle_range_check check (cycle_start is null or cycle_end is null or cycle_end >= cycle_start);

create unique index if not exists rooms_login_id_key on public.rooms(login_id);
create unique index if not exists rooms_legacy_local_id_key on public.rooms(legacy_local_id) where legacy_local_id is not null;

-- ── Room members: placeholders can exist before claim ───────
alter table public.room_members
  alter column user_id drop not null;

alter table public.room_members
  add column if not exists login_username text,
  add column if not exists is_virtual boolean not null default false,
  add column if not exists joined_via text not null default 'manual',
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists previous_user_id uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_active_at timestamptz;

alter table public.room_members
  drop constraint if exists room_members_status_check,
  drop constraint if exists room_members_joined_via_check,
  drop constraint if exists room_members_claim_shape_check,
  drop constraint if exists room_members_login_username_format_check;

alter table public.room_members
  add constraint room_members_status_check check (status in ('active','invited','left','removed')),
  add constraint room_members_joined_via_check check (joined_via in ('creator','invite','manual','import','demo')),
  add constraint room_members_login_username_format_check check (login_username is null or login_username ~ '^[a-z0-9][a-z0-9._-]{1,39}$'),
  add constraint room_members_claim_shape_check check (
    (is_virtual and user_id is null)
    or (status = 'invited' and user_id is null)
    or (status in ('active','left','removed') and (user_id is not null or is_virtual))
  );

create unique index if not exists room_members_room_login_username_key
  on public.room_members(room_id, lower(login_username)) where login_username is not null;
create unique index if not exists room_members_room_display_name_live_key
  on public.room_members(room_id, lower(trim(display_name))) where status in ('active','invited');
create index if not exists room_members_user_id_idx on public.room_members(user_id) where user_id is not null;
create index if not exists room_members_room_status_idx on public.room_members(room_id, status);

-- ── Secrets/invites are RPC-only (no direct PostgREST policies) ──
create table if not exists public.room_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  password_hash text not null check (length(password_hash) >= 20),
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  target_member_id uuid,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_uses integer not null default 1 check (max_uses between 1 and 20),
  use_count integer not null default 0 check (use_count >= 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint room_invites_room_target_fk
    foreign key (room_id, target_member_id) references public.room_members(room_id, id) on delete cascade
);
create index if not exists room_invites_room_active_idx
  on public.room_invites(room_id, expires_at) where revoked_at is null;

-- ── Expenses + splits + reactions ──────────────────────────
create table if not exists public.expenses (
  id text primary key check (length(id) between 3 and 100),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  payer_member_id uuid not null,
  description text not null check (length(trim(description)) between 1 and 200),
  category text not null check (category in ('rent','groceries','electricity','wifi','food','transport','maid','gas','water','subscription','medicine','shopping','other')),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000),
  method text not null check (method in ('cash','upi','card')),
  split_mode text not null check (split_mode in ('equal','percent','exact','subset')),
  note text,
  vendor_name text,
  vendor_upi_id text,
  instant_pay boolean not null default false,
  source text not null default 'manual' check (source in ('manual','sms','ocr','voice','rule','recurring','quickbuy')),
  confidence smallint check (confidence is null or confidence between 0 and 100),
  status text not null default 'confirmed' check (status in ('confirmed','pending','ignored')),
  raw_text text,
  photo_url text,
  occurred_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_room_payer_fk
    foreign key (room_id, payer_member_id) references public.room_members(room_id, id) on delete restrict,
  constraint expenses_room_id_id_key unique (room_id, id)
);
create index if not exists expenses_room_time_idx on public.expenses(room_id, occurred_at desc) where deleted_at is null;
create index if not exists expenses_payer_time_idx on public.expenses(payer_member_id, occurred_at desc) where deleted_at is null;

create table if not exists public.expense_splits (
  expense_id text not null references public.expenses(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null,
  amount_paise bigint not null check (amount_paise >= 0 and amount_paise <= 1000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (expense_id, member_id),
  constraint expense_splits_room_expense_fk
    foreign key (room_id, expense_id) references public.expenses(room_id, id) on delete cascade,
  constraint expense_splits_room_member_fk
    foreign key (room_id, member_id) references public.room_members(room_id, id) on delete restrict
);
create index if not exists expense_splits_room_member_idx on public.expense_splits(room_id, member_id);

create table if not exists public.expense_reactions (
  expense_id text not null references public.expenses(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null,
  emoji text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (expense_id, member_id, emoji),
  constraint expense_reactions_room_expense_fk
    foreign key (room_id, expense_id) references public.expenses(room_id, id) on delete cascade,
  constraint expense_reactions_room_member_fk
    foreign key (room_id, member_id) references public.room_members(room_id, id) on delete cascade
);

-- ── Settlements + confirmations ────────────────────────────
create table if not exists public.settlements (
  id text primary key check (length(id) between 3 and 100),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  from_member_id uuid not null,
  to_member_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000),
  method text not null check (method in ('cash','upi','card')),
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_room_from_fk
    foreign key (room_id, from_member_id) references public.room_members(room_id, id) on delete restrict,
  constraint settlements_room_to_fk
    foreign key (room_id, to_member_id) references public.room_members(room_id, id) on delete restrict,
  constraint settlements_different_people check (from_member_id <> to_member_id),
  constraint settlements_room_id_id_key unique (room_id, id)
);
create index if not exists settlements_room_time_idx on public.settlements(room_id, created_at desc) where deleted_at is null;

create table if not exists public.settlement_confirmations (
  settlement_id text not null references public.settlements(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null,
  confirmed_at timestamptz not null default now(),
  primary key (settlement_id, member_id),
  constraint settlement_confirmations_room_settlement_fk
    foreign key (room_id, settlement_id) references public.settlements(room_id, id) on delete cascade,
  constraint settlement_confirmations_room_member_fk
    foreign key (room_id, member_id) references public.room_members(room_id, id) on delete cascade
);

-- ── Recurring templates (owner-payer only in cloud) ────────
create table if not exists public.recurring_expenses (
  id text primary key check (length(id) between 3 and 100),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  payer_member_id uuid not null,
  description text not null check (length(trim(description)) between 1 and 200),
  category text not null check (category in ('rent','groceries','electricity','wifi','food','transport','maid','gas','water','subscription','medicine','shopping','other')),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000),
  split_mode text not null check (split_mode in ('equal','percent','exact','subset')),
  day_of_month smallint not null check (day_of_month between 1 and 28),
  method text not null check (method in ('cash','upi','card')),
  active boolean not null default true,
  last_run_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_expenses_room_payer_fk
    foreign key (room_id, payer_member_id) references public.room_members(room_id, id) on delete restrict
);

-- ── Audit activity (readable by room members, trigger-written) ──
create table if not exists public.room_activity_log (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_member_id uuid,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint room_activity_log_room_member_fk
    foreign key (room_id, actor_member_id) references public.room_members(room_id, id) on delete set null
);
create index if not exists room_activity_log_room_time_idx on public.room_activity_log(room_id, created_at desc);

-- ── RLS helper functions ───────────────────────────────────
create or replace function public.current_room_member_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.room_members
  where room_id = p_room_id and user_id = auth.uid() and status = 'active' and not is_virtual
  limit 1
$$;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_room_member_id(p_room_id) is not null
$$;

create or replace function public.is_room_admin(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and status = 'active'
      and not is_virtual and role in ('owner','admin')
  )
$$;

create or replace function public.member_is_current_user(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where id = p_member_id and user_id = auth.uid() and status = 'active' and not is_virtual
  )
$$;

create or replace function public.expense_payer_is_current_user(p_expense_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.expenses e
    join public.room_members m on m.id = e.payer_member_id and m.room_id = e.room_id
    where e.id = p_expense_id and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function public.expense_room_id(p_expense_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from public.expenses where id = p_expense_id
$$;

create or replace function public.settlement_room_id(p_settlement_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select room_id from public.settlements where id = p_settlement_id
$$;

revoke all on function public.current_room_member_id(uuid) from public, anon;
revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.is_room_admin(uuid) from public, anon;
revoke all on function public.member_is_current_user(uuid) from public, anon;
revoke all on function public.expense_payer_is_current_user(text) from public, anon;
revoke all on function public.expense_room_id(text) from public, anon;
revoke all on function public.settlement_room_id(text) from public, anon;
grant execute on function public.current_room_member_id(uuid) to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_room_admin(uuid) to authenticated;
grant execute on function public.member_is_current_user(uuid) to authenticated;
grant execute on function public.expense_payer_is_current_user(text) to authenticated;
grant execute on function public.expense_room_id(text) to authenticated;
grant execute on function public.settlement_room_id(text) to authenticated;

-- ── Profile auto-create ────────────────────────────────────
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), 'Roomie'),
    nullif(new.raw_user_meta_data->>'full_name','')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ── Updated-at triggers ────────────────────────────────────
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at before update on public.rooms for each row execute function public.set_updated_at();
drop trigger if exists room_members_set_updated_at on public.room_members;
create trigger room_members_set_updated_at before update on public.room_members for each row execute function public.set_updated_at();
drop trigger if exists room_secrets_set_updated_at on public.room_secrets;
create trigger room_secrets_set_updated_at before update on public.room_secrets for each row execute function public.set_updated_at();
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_updated_at();
drop trigger if exists expense_splits_set_updated_at on public.expense_splits;
create trigger expense_splits_set_updated_at before update on public.expense_splits for each row execute function public.set_updated_at();
drop trigger if exists settlements_set_updated_at on public.settlements;
create trigger settlements_set_updated_at before update on public.settlements for each row execute function public.set_updated_at();
drop trigger if exists recurring_expenses_set_updated_at on public.recurring_expenses;
create trigger recurring_expenses_set_updated_at before update on public.recurring_expenses for each row execute function public.set_updated_at();

-- ── Expense audit trigger ──────────────────────────────────
create or replace function public.log_expense_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
  v_entity text;
  v_member uuid;
begin
  if tg_op = 'DELETE' then
    v_room := old.room_id; v_entity := old.id;
  else
    v_room := new.room_id; v_entity := new.id;
  end if;
  select id into v_member from public.room_members
  where room_id = v_room and user_id = auth.uid() and status = 'active' limit 1;
  insert into public.room_activity_log(room_id, actor_user_id, actor_member_id, entity_type, entity_id, action, metadata)
  values (
    v_room, auth.uid(), v_member, 'expense', v_entity, lower(tg_op),
    case when tg_op = 'DELETE' then jsonb_build_object('description', old.description, 'amount_paise', old.amount_paise)
         else jsonb_build_object('description', new.description, 'amount_paise', new.amount_paise, 'deleted', new.deleted_at is not null) end
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists expenses_activity_log on public.expenses;
create trigger expenses_activity_log
after insert or update or delete on public.expenses
for each row execute function public.log_expense_activity();

-- ── Enable RLS everywhere ──────────────────────────────────
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.expense_reactions enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_confirmations enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.room_activity_log enable row level security;

-- Drop same-name policies if migration is re-run in a fresh review.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists rooms_select_members on public.rooms;
drop policy if exists room_members_select_room on public.room_members;
drop policy if exists expenses_select_room on public.expenses;
drop policy if exists expenses_insert_own_payer on public.expenses;
drop policy if exists expenses_update_own_payer on public.expenses;
drop policy if exists expenses_delete_own_payer on public.expenses;
drop policy if exists expense_splits_select_room on public.expense_splits;
drop policy if exists expense_splits_insert_own_expense on public.expense_splits;
drop policy if exists expense_splits_update_own_expense on public.expense_splits;
drop policy if exists expense_splits_delete_own_expense on public.expense_splits;
drop policy if exists expense_reactions_select_room on public.expense_reactions;
drop policy if exists expense_reactions_insert_own on public.expense_reactions;
drop policy if exists expense_reactions_delete_own on public.expense_reactions;
drop policy if exists settlements_select_room on public.settlements;
drop policy if exists settlements_insert_involved on public.settlements;
drop policy if exists settlements_update_creator on public.settlements;
drop policy if exists settlements_delete_creator on public.settlements;
drop policy if exists settlement_confirmations_select_room on public.settlement_confirmations;
drop policy if exists settlement_confirmations_insert_own on public.settlement_confirmations;
drop policy if exists settlement_confirmations_delete_own on public.settlement_confirmations;
drop policy if exists recurring_select_room on public.recurring_expenses;
drop policy if exists recurring_insert_own_payer on public.recurring_expenses;
drop policy if exists recurring_update_own_payer on public.recurring_expenses;
drop policy if exists recurring_delete_own_payer on public.recurring_expenses;
drop policy if exists room_activity_select_room on public.room_activity_log;

-- Profiles: strictly own row.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Rooms/members: read by active room members; writes only via reviewed RPCs.
create policy rooms_select_members on public.rooms
  for select to authenticated using (public.is_room_member(id));
create policy room_members_select_room on public.room_members
  for select to authenticated using (public.is_room_member(room_id) or user_id = auth.uid());

-- Expenses: all room members read; only payer-owner writes.
create policy expenses_select_room on public.expenses
  for select to authenticated using (public.is_room_member(room_id));
create policy expenses_insert_own_payer on public.expenses
  for insert to authenticated with check (
    created_by_user_id = auth.uid()
    and payer_member_id = public.current_room_member_id(room_id)
  );
create policy expenses_update_own_payer on public.expenses
  for update to authenticated
  using (public.member_is_current_user(payer_member_id))
  with check (public.member_is_current_user(payer_member_id));
create policy expenses_delete_own_payer on public.expenses
  for delete to authenticated using (public.member_is_current_user(payer_member_id));

create policy expense_splits_select_room on public.expense_splits
  for select to authenticated using (public.is_room_member(room_id));
create policy expense_splits_insert_own_expense on public.expense_splits
  for insert to authenticated with check (
    room_id = public.expense_room_id(expense_id)
    and public.expense_payer_is_current_user(expense_id)
  );
create policy expense_splits_update_own_expense on public.expense_splits
  for update to authenticated
  using (public.expense_payer_is_current_user(expense_id))
  with check (room_id = public.expense_room_id(expense_id) and public.expense_payer_is_current_user(expense_id));
create policy expense_splits_delete_own_expense on public.expense_splits
  for delete to authenticated using (public.expense_payer_is_current_user(expense_id));

create policy expense_reactions_select_room on public.expense_reactions
  for select to authenticated using (public.is_room_member(room_id));
create policy expense_reactions_insert_own on public.expense_reactions
  for insert to authenticated with check (
    room_id = public.expense_room_id(expense_id)
    and member_id = public.current_room_member_id(room_id)
  );
create policy expense_reactions_delete_own on public.expense_reactions
  for delete to authenticated using (member_id = public.current_room_member_id(room_id));

-- Settlements: creator must be one side of the payment.
create policy settlements_select_room on public.settlements
  for select to authenticated using (public.is_room_member(room_id));
create policy settlements_insert_involved on public.settlements
  for insert to authenticated with check (
    created_by_user_id = auth.uid()
    and public.current_room_member_id(room_id) in (from_member_id, to_member_id)
  );
create policy settlements_update_creator on public.settlements
  for update to authenticated
  using (created_by_user_id = auth.uid() and public.current_room_member_id(room_id) in (from_member_id, to_member_id))
  with check (created_by_user_id = auth.uid() and public.current_room_member_id(room_id) in (from_member_id, to_member_id));
create policy settlements_delete_creator on public.settlements
  for delete to authenticated using (created_by_user_id = auth.uid());

create policy settlement_confirmations_select_room on public.settlement_confirmations
  for select to authenticated using (public.is_room_member(room_id));
create policy settlement_confirmations_insert_own on public.settlement_confirmations
  for insert to authenticated with check (
    room_id = public.settlement_room_id(settlement_id)
    and member_id = public.current_room_member_id(room_id)
  );
create policy settlement_confirmations_delete_own on public.settlement_confirmations
  for delete to authenticated using (member_id = public.current_room_member_id(room_id));

-- Recurring: payer-owner controls template.
create policy recurring_select_room on public.recurring_expenses
  for select to authenticated using (public.is_room_member(room_id));
create policy recurring_insert_own_payer on public.recurring_expenses
  for insert to authenticated with check (
    created_by_user_id = auth.uid()
    and payer_member_id = public.current_room_member_id(room_id)
  );
create policy recurring_update_own_payer on public.recurring_expenses
  for update to authenticated
  using (public.member_is_current_user(payer_member_id))
  with check (public.member_is_current_user(payer_member_id));
create policy recurring_delete_own_payer on public.recurring_expenses
  for delete to authenticated using (public.member_is_current_user(payer_member_id));

create policy room_activity_select_room on public.room_activity_log
  for select to authenticated using (public.is_room_member(room_id));

-- No direct policies are created for room_secrets or room_invites.
-- They are accessible only to SECURITY DEFINER RPCs in the next migration.

-- ── Table privileges (RLS still decides row access) ────────
revoke all on table public.profiles, public.rooms, public.room_members, public.room_secrets, public.room_invites,
  public.expenses, public.expense_splits, public.expense_reactions, public.settlements,
  public.settlement_confirmations, public.recurring_expenses, public.room_activity_log
from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.rooms, public.room_members, public.room_activity_log to authenticated;
grant select, insert, update, delete on table public.expenses, public.expense_splits, public.settlements, public.recurring_expenses to authenticated;
grant select, insert, delete on table public.expense_reactions, public.settlement_confirmations to authenticated;

-- ── Realtime for room tables ───────────────────────────────
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_members;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.expense_splits;
alter publication supabase_realtime add table public.expense_reactions;
alter publication supabase_realtime add table public.settlements;
alter publication supabase_realtime add table public.settlement_confirmations;
alter publication supabase_realtime add table public.recurring_expenses;
