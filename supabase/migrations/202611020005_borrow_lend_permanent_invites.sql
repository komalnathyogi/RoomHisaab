-- v7.2.4 release candidate: private, non-expiring admin invites and room-scoped borrowing.
-- A permanent invite remains an authenticated, room-password-protected invite; it is NOT a sign-in link.

alter table public.room_invites alter column expires_at drop not null;

drop function if exists public.create_room_invite(uuid,uuid,integer,integer);
create or replace function public.create_room_invite(
  p_room_id uuid,
  p_target_member_id uuid default null,
  p_expires_days integer default 7,
  p_max_uses integer default 8,
  p_never_expires boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_login text;
  v_token text;
  v_expires timestamptz;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','Sign in to manage room invites.'); end if;
  if not public.is_room_admin(p_room_id) then
    return jsonb_build_object('ok',false,'error','Only a room owner or admin can create an invite.');
  end if;
  select login_id into v_login from public.rooms where id=p_room_id and archived_at is null;
  if v_login is null then return jsonb_build_object('ok',false,'error','Room not found.'); end if;
  if p_target_member_id is not null and not exists (
    select 1 from public.room_members
    where id=p_target_member_id and room_id=p_room_id and user_id is null
      and status='invited' and not is_virtual
  ) then
    return jsonb_build_object('ok',false,'error','That member has already claimed their account or is not available.');
  end if;

  -- Rotate only invites of the same type/target. Old links stop working immediately.
  update public.room_invites set revoked_at=now()
  where room_id=p_room_id and target_member_id is not distinct from p_target_member_id and revoked_at is null;

  v_expires := case when p_never_expires then 'infinity'::timestamptz
    else now() + make_interval(days => least(30, greatest(1, coalesce(p_expires_days,7)))) end;
  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(32),'base64'),'+','-'),'/','_'),'=','');
  insert into public.room_invites(room_id, target_member_id, token_hash, created_by_user_id, expires_at, max_uses)
  values (
    p_room_id, p_target_member_id,
    encode(extensions.digest(v_token,'sha256'),'hex'),
    v_user, v_expires,
    case when p_target_member_id is not null then 1 else least(20,greatest(1,coalesce(p_max_uses,8))) end
  );
  return jsonb_build_object('ok',true,'token',v_token,'room_login_id',v_login,'expires_at',case when p_never_expires then null else to_jsonb(v_expires) end,'never_expires',p_never_expires);
end;
$$;
revoke all on function public.create_room_invite(uuid,uuid,integer,integer,boolean) from public, anon;
grant execute on function public.create_room_invite(uuid,uuid,integer,integer,boolean) to authenticated;

create table if not exists public.borrow_requests (
  id text primary key check (length(id) between 3 and 100),
  room_id uuid not null references public.rooms(id) on delete cascade,
  requester_member_id uuid not null,
  counterparty_member_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000000),
  reason text not null check (length(trim(reason)) between 1 and 200),
  status text not null default 'requested' check (status in ('requested','approved','declined','cancelled')),
  reviewed_by_member_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint borrow_requests_not_self check (requester_member_id <> counterparty_member_id),
  constraint borrow_requests_requester_fk foreign key (room_id, requester_member_id) references public.room_members(room_id,id) on delete cascade,
  constraint borrow_requests_counterparty_fk foreign key (room_id, counterparty_member_id) references public.room_members(room_id,id) on delete cascade,
  constraint borrow_requests_reviewer_fk foreign key (room_id, reviewed_by_member_id) references public.room_members(room_id,id) on delete cascade
);
create index if not exists borrow_requests_room_created_idx on public.borrow_requests(room_id, created_at desc);

create table if not exists public.room_loans (
  id text primary key check (length(id) between 3 and 100),
  room_id uuid not null references public.rooms(id) on delete cascade,
  lender_member_id uuid not null,
  borrower_member_id uuid not null,
  principal_paise bigint not null check (principal_paise > 0 and principal_paise <= 100000000000),
  repaid_paise bigint not null default 0 check (repaid_paise >= 0 and repaid_paise <= principal_paise),
  pending_repayment_paise bigint not null default 0 check (pending_repayment_paise >= 0),
  pending_repayment_by uuid,
  request_id text unique references public.borrow_requests(id) on delete set null,
  status text not null check (status in ('awaiting_borrower_ack','awaiting_lender_ack','active','repayment_pending','repaid','cancelled')),
  note text,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_loans_not_self check (lender_member_id <> borrower_member_id),
  constraint room_loans_pending_bounded check (pending_repayment_paise <= principal_paise - repaid_paise),
  constraint room_loans_lender_fk foreign key (room_id, lender_member_id) references public.room_members(room_id,id) on delete cascade,
  constraint room_loans_borrower_fk foreign key (room_id, borrower_member_id) references public.room_members(room_id,id) on delete cascade,
  constraint room_loans_creator_fk foreign key (room_id, created_by_member_id) references public.room_members(room_id,id) on delete cascade,
  constraint room_loans_pending_member_fk foreign key (room_id, pending_repayment_by) references public.room_members(room_id,id) on delete cascade
);
create index if not exists room_loans_room_created_idx on public.room_loans(room_id, created_at desc);

create table if not exists public.loan_events (
  id text primary key check (length(id) between 3 and 130),
  room_id uuid not null references public.rooms(id) on delete cascade,
  loan_id text not null references public.room_loans(id) on delete cascade,
  actor_member_id uuid not null,
  kind text not null check (kind in ('funds_recorded','receipt_confirmed','sent_confirmed','repayment_reported','repayment_confirmed','repayment_declined','loan_cancelled')),
  amount_paise bigint check (amount_paise is null or amount_paise > 0),
  created_at timestamptz not null default now(),
  constraint loan_events_actor_fk foreign key (room_id, actor_member_id) references public.room_members(room_id,id) on delete cascade
);
create index if not exists loan_events_room_created_idx on public.loan_events(room_id, created_at desc);

alter table public.borrow_requests enable row level security;
alter table public.room_loans enable row level security;
alter table public.loan_events enable row level security;
revoke all on table public.borrow_requests, public.room_loans, public.loan_events from anon, authenticated;
grant select on table public.borrow_requests, public.room_loans, public.loan_events to authenticated;

drop policy if exists borrow_requests_member_read on public.borrow_requests;
create policy borrow_requests_member_read on public.borrow_requests for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=borrow_requests.room_id and m.user_id=auth.uid() and m.status='active' and not m.is_virtual)
);
drop policy if exists room_loans_member_read on public.room_loans;
create policy room_loans_member_read on public.room_loans for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=room_loans.room_id and m.user_id=auth.uid() and m.status='active' and not m.is_virtual)
);
drop policy if exists loan_events_member_read on public.loan_events;
create policy loan_events_member_read on public.loan_events for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=loan_events.room_id and m.user_id=auth.uid() and m.status='active' and not m.is_virtual)
);

create or replace function public.borrow_lend_action(p_room_id uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_actor uuid;
  v_other uuid;
  v_id text;
  v_request_id text;
  v_status text;
  v_decision text;
  v_amount bigint;
  v_row record;
  v_lender uuid;
  v_borrower uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','Sign in again to continue.'); end if;
  select id into v_actor from public.room_members
  where room_id=p_room_id and user_id=v_user and status='active' and not is_virtual
  order by created_at limit 1;
  if v_actor is null then return jsonb_build_object('ok',false,'error','Your active room membership was not found.'); end if;

  if p_action='request' then
    v_other := nullif(p_payload->>'counterparty_member_id','')::uuid;
    v_amount := nullif(p_payload->>'amount_paise','')::bigint;
    v_id := nullif(p_payload->>'id','');
    if v_other is null or v_other=v_actor or v_amount is null or v_amount <= 0 or v_amount > 100000000000 or length(trim(coalesce(p_payload->>'reason',''))) not between 1 and 200 then
      return jsonb_build_object('ok',false,'error','Check the recipient, amount and reason.');
    end if;
    if not exists (select 1 from public.room_members where room_id=p_room_id and id=v_other and status='active' and not is_virtual) then
      return jsonb_build_object('ok',false,'error','The selected member is not active in this room.');
    end if;
    if v_id is null or length(v_id) not between 3 and 100 then return jsonb_build_object('ok',false,'error','Request ID is invalid.'); end if;
    insert into public.borrow_requests(id,room_id,requester_member_id,counterparty_member_id,amount_paise,reason)
    values(v_id,p_room_id,v_actor,v_other,v_amount,trim(p_payload->>'reason')) on conflict (id) do nothing;
    return jsonb_build_object('ok',true,'id',v_id);

  elsif p_action='review_request' then
    v_id := p_payload->>'request_id'; v_decision := p_payload->>'decision';
    if v_decision not in ('approved','declined') then return jsonb_build_object('ok',false,'error','Choose approve or decline.'); end if;
    select * into v_row from public.borrow_requests where id=v_id and room_id=p_room_id for update;
    if not found or v_row.counterparty_member_id<>v_actor or v_row.status<>'requested' then return jsonb_build_object('ok',false,'error','This request is no longer available to you.'); end if;
    update public.borrow_requests set status=v_decision, reviewed_by_member_id=v_actor, reviewed_at=now(), updated_at=now() where id=v_id;
    return jsonb_build_object('ok',true,'id',v_id,'status',v_decision);

  elsif p_action='cancel_request' then
    v_id := p_payload->>'request_id';
    update public.borrow_requests set status='cancelled',updated_at=now()
    where id=v_id and room_id=p_room_id and requester_member_id=v_actor and status='requested';
    if not found then return jsonb_build_object('ok',false,'error','This request can no longer be cancelled.'); end if;
    return jsonb_build_object('ok',true,'id',v_id,'status','cancelled');

  elsif p_action='record_loan' then
    v_lender := nullif(p_payload->>'lender_member_id','')::uuid;
    v_borrower := nullif(p_payload->>'borrower_member_id','')::uuid;
    v_amount := nullif(p_payload->>'principal_paise','')::bigint;
    v_id := nullif(p_payload->>'id','');
    v_request_id := nullif(p_payload->>'request_id','');
    if v_lender is null or v_borrower is null or v_lender=v_borrower or v_amount is null or v_amount<=0 or v_amount>100000000000 then
      return jsonb_build_object('ok',false,'error','Check the lender, borrower and amount.');
    end if;
    if v_actor not in (v_lender,v_borrower) or not exists(select 1 from public.room_members where id=v_lender and room_id=p_room_id and status='active' and not is_virtual) or not exists(select 1 from public.room_members where id=v_borrower and room_id=p_room_id and status='active' and not is_virtual) then
      return jsonb_build_object('ok',false,'error','Only the two active members can record this loan.');
    end if;
    if v_request_id is not null and not exists(select 1 from public.borrow_requests where id=v_request_id and room_id=p_room_id and status='approved' and requester_member_id=v_borrower and counterparty_member_id=v_lender) then
      return jsonb_build_object('ok',false,'error','An approved matching request is required.');
    end if;
    if v_id is null or length(v_id) not between 3 and 100 then return jsonb_build_object('ok',false,'error','Loan ID is invalid.'); end if;
    v_status := case when v_actor=v_lender then 'awaiting_borrower_ack' else 'awaiting_lender_ack' end;
    insert into public.room_loans(id,room_id,lender_member_id,borrower_member_id,principal_paise,request_id,status,note,created_by_member_id)
    values(v_id,p_room_id,v_lender,v_borrower,v_amount,v_request_id,v_status,nullif(trim(p_payload->>'note'),''),v_actor) on conflict (id) do nothing;
    insert into public.loan_events(id,room_id,loan_id,actor_member_id,kind,amount_paise)
    values(v_id||':created',p_room_id,v_id,v_actor,'funds_recorded',v_amount) on conflict (id) do nothing;
    return jsonb_build_object('ok',true,'id',v_id,'status',v_status);

  elsif p_action='acknowledge_funds' then
    v_id := p_payload->>'loan_id';
    select * into v_row from public.room_loans where id=v_id and room_id=p_room_id for update;
    if not found then return jsonb_build_object('ok',false,'error','Loan record not found.'); end if;
    if v_row.status='awaiting_borrower_ack' and v_actor=v_row.borrower_member_id then
      update public.room_loans set status='active',updated_at=now() where id=v_id;
      insert into public.loan_events(id,room_id,loan_id,actor_member_id,kind) values(v_id||':funds-confirmed',p_room_id,v_id,v_actor,'receipt_confirmed') on conflict(id) do nothing;
    elsif v_row.status='awaiting_lender_ack' and v_actor=v_row.lender_member_id then
      update public.room_loans set status='active',updated_at=now() where id=v_id;
      insert into public.loan_events(id,room_id,loan_id,actor_member_id,kind) values(v_id||':funds-confirmed',p_room_id,v_id,v_actor,'sent_confirmed') on conflict(id) do nothing;
    else return jsonb_build_object('ok',false,'error','Only the other member can confirm this transfer.'); end if;
    return jsonb_build_object('ok',true,'id',v_id,'status','active');

  elsif p_action='report_repayment' then
    v_id := p_payload->>'loan_id';
    v_amount := nullif(p_payload->>'amount_paise','')::bigint;
    select * into v_row from public.room_loans where id=v_id and room_id=p_room_id for update;
    if not found or v_actor<>v_row.borrower_member_id or v_row.status<>'active' or v_amount is null or v_amount<=0 or v_amount>v_row.principal_paise-v_row.repaid_paise then
      return jsonb_build_object('ok',false,'error','This repayment cannot be recorded. Check the amount and loan status.');
    end if;
    update public.room_loans set status='repayment_pending',pending_repayment_paise=v_amount,pending_repayment_by=v_actor,updated_at=now() where id=v_id;
    insert into public.loan_events(id,room_id,loan_id,actor_member_id,kind,amount_paise) values(v_id||':repayment:'||floor(extract(epoch from clock_timestamp())*1000)::bigint,p_room_id,v_id,v_actor,'repayment_reported',v_amount);
    return jsonb_build_object('ok',true,'id',v_id,'status','repayment_pending');

  elsif p_action='review_repayment' then
    v_id := p_payload->>'loan_id'; v_decision := p_payload->>'decision';
    select * into v_row from public.room_loans where id=v_id and room_id=p_room_id for update;
    if not found or v_actor<>v_row.lender_member_id or v_row.status<>'repayment_pending' or v_decision not in ('confirm','decline') then
      return jsonb_build_object('ok',false,'error','Only the lender can confirm or decline this pending repayment.');
    end if;
    if v_decision='confirm' then
      v_amount := v_row.pending_repayment_paise;
      update public.room_loans set repaid_paise=repaid_paise+v_amount,pending_repayment_paise=0,pending_repayment_by=null,
        status=case when repaid_paise+v_amount>=principal_paise then 'repaid' else 'active' end,updated_at=now() where id=v_id;
      insert into public.loan_events(id,room_id,loan_id,actor_member_id,kind,amount_paise) values(v_id||':repayment-confirmed:'||floor(extract(epoch from clock_timestamp())*1000)::bigint,p_room_id,v_id,v_actor,'repayment_confirmed',v_amount);
    else
      v_amount := v_row.pending_repayment_paise;
      update public.room_loans set pending_repayment_paise=0,pending_repayment_by=null,status='active',updated_at=now() where id=v_id;
      insert into public.loan_events(id,room_id,loan_id,actor_member_id,kind,amount_paise) values(v_id||':repayment-declined:'||floor(extract(epoch from clock_timestamp())*1000)::bigint,p_room_id,v_id,v_actor,'repayment_declined',v_amount);
    end if;
    return jsonb_build_object('ok',true,'id',v_id,'decision',v_decision);
  end if;
  return jsonb_build_object('ok',false,'error','Unsupported Borrow & Lend action.');
end;
$$;
revoke all on function public.borrow_lend_action(uuid,text,jsonb) from public, anon;
grant execute on function public.borrow_lend_action(uuid,text,jsonb) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='borrow_requests') then alter publication supabase_realtime add table public.borrow_requests; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_loans') then alter publication supabase_realtime add table public.room_loans; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loan_events') then alter publication supabase_realtime add table public.loan_events; end if;
end $$;

create or replace function public.revoke_room_invites(p_room_id uuid, p_target_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','Sign in to manage invites.'); end if;
  if not public.is_room_admin(p_room_id) then return jsonb_build_object('ok',false,'error','Only a room owner or admin can revoke invites.'); end if;
  update public.room_invites set revoked_at=now()
  where room_id=p_room_id and target_member_id is not distinct from p_target_member_id and revoked_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok',true,'revoked',v_count);
end;
$$;
revoke all on function public.revoke_room_invites(uuid,uuid) from public, anon;
grant execute on function public.revoke_room_invites(uuid,uuid) to authenticated;

-- Extend the one-time local-room migration without changing its audited expense/member mapping.
alter function public.migrate_local_room_to_cloud(jsonb) rename to migrate_local_room_to_cloud_v1;
revoke all on function public.migrate_local_room_to_cloud_v1(jsonb) from public, anon, authenticated;
create or replace function public.migrate_local_room_to_cloud(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_room_id uuid;
  v_item jsonb;
  v_requester uuid;
  v_counterparty uuid;
  v_lender uuid;
  v_borrower uuid;
  v_creator uuid;
  v_pending_by uuid;
  v_actor uuid;
begin
  v_result := public.migrate_local_room_to_cloud_v1(p_payload);
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  v_room_id := (v_result->>'room_id')::uuid;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'borrow_requests','[]'::jsonb)) loop
    select cloud_id into v_requester from pg_temp.rh_migration_member_map where local_id=v_item->>'requester_local_id';
    select cloud_id into v_counterparty from pg_temp.rh_migration_member_map where local_id=v_item->>'counterparty_local_id';
    if v_requester is null or v_counterparty is null then raise exception 'A Borrow & Lend request references an unknown member.'; end if;
    v_actor := null;
    if nullif(v_item->>'reviewer_local_id','') is not null then
      select cloud_id into v_actor from pg_temp.rh_migration_member_map where local_id=v_item->>'reviewer_local_id';
    end if;
    insert into public.borrow_requests(id,room_id,requester_member_id,counterparty_member_id,amount_paise,reason,status,reviewed_by_member_id,reviewed_at,created_at,updated_at)
    values(
      v_item->>'local_id',v_room_id,v_requester,v_counterparty,(v_item->>'amount_paise')::bigint,
      left(trim(coalesce(v_item->>'reason','Loan request')),200),coalesce(nullif(v_item->>'status',''),'requested'),v_actor,
      case when v_actor is not null then to_timestamp(coalesce((v_item->>'updated_at_ms')::numeric,extract(epoch from now())*1000)/1000) end,
      to_timestamp(coalesce((v_item->>'created_at_ms')::numeric,extract(epoch from now())*1000)/1000),
      to_timestamp(coalesce((v_item->>'updated_at_ms')::numeric,extract(epoch from now())*1000)/1000)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'loans','[]'::jsonb)) loop
    select cloud_id into v_lender from pg_temp.rh_migration_member_map where local_id=v_item->>'lender_local_id';
    select cloud_id into v_borrower from pg_temp.rh_migration_member_map where local_id=v_item->>'borrower_local_id';
    select cloud_id into v_creator from pg_temp.rh_migration_member_map where local_id=v_item->>'creator_local_id';
    v_pending_by := null;
    if nullif(v_item->>'pending_repayment_by_local_id','') is not null then select cloud_id into v_pending_by from pg_temp.rh_migration_member_map where local_id=v_item->>'pending_repayment_by_local_id'; end if;
    if v_lender is null or v_borrower is null or v_creator is null then raise exception 'A loan references an unknown member.'; end if;
    insert into public.room_loans(id,room_id,lender_member_id,borrower_member_id,principal_paise,repaid_paise,pending_repayment_paise,pending_repayment_by,request_id,status,note,created_by_member_id,created_at,updated_at)
    values(
      v_item->>'local_id',v_room_id,v_lender,v_borrower,(v_item->>'principal_paise')::bigint,
      greatest(0,coalesce((v_item->>'repaid_paise')::bigint,0)),greatest(0,coalesce((v_item->>'pending_repayment_paise')::bigint,0)),v_pending_by,
      nullif(v_item->>'request_local_id',''),coalesce(nullif(v_item->>'status',''),'active'),nullif(trim(v_item->>'note'),''),v_creator,
      to_timestamp(coalesce((v_item->>'created_at_ms')::numeric,extract(epoch from now())*1000)/1000),
      to_timestamp(coalesce((v_item->>'updated_at_ms')::numeric,extract(epoch from now())*1000)/1000)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'loan_events','[]'::jsonb)) loop
    select cloud_id into v_actor from pg_temp.rh_migration_member_map where local_id=v_item->>'actor_local_id';
    if v_actor is null then raise exception 'A loan history event references an unknown member.'; end if;
    insert into public.loan_events(id,room_id,loan_id,actor_member_id,kind,amount_paise,created_at)
    values(v_item->>'local_id',v_room_id,v_item->>'loan_local_id',v_actor,v_item->>'kind',nullif(v_item->>'amount_paise','')::bigint,
      to_timestamp(coalesce((v_item->>'created_at_ms')::numeric,extract(epoch from now())*1000)/1000));
  end loop;
  return v_result || jsonb_build_object('borrow_requests',jsonb_array_length(coalesce(p_payload->'borrow_requests','[]'::jsonb)),'loans',jsonb_array_length(coalesce(p_payload->'loans','[]'::jsonb)));
exception when others then
  return jsonb_build_object('ok',false,'error','Local room migration failed: '||SQLERRM);
end;
$$;
revoke all on function public.migrate_local_room_to_cloud(jsonb) from public, anon;
grant execute on function public.migrate_local_room_to_cloud(jsonb) to authenticated;
