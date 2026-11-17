-- RoomHisaab local -> cloud migration
-- Security model: this RPC can only create a brand-new cloud room. It cannot
-- insert into or modify an existing cloud room. The authenticated caller is
-- mapped to exactly one local member; every other imported member remains an
-- unclaimed placeholder until that person joins with the room password and
-- creates a personal login. After migration, normal payer-owner RLS applies.

alter table public.settlements
  alter column created_by_user_id drop not null;

create or replace function public.migrate_local_room_to_cloud(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_room_in jsonb := coalesce(p_payload->'room','{}'::jsonb);
  v_members jsonb := coalesce(p_payload->'members','[]'::jsonb);
  v_expenses jsonb := coalesce(p_payload->'expenses','[]'::jsonb);
  v_settlements jsonb := coalesce(p_payload->'settlements','[]'::jsonb);
  v_recurring jsonb := coalesce(p_payload->'recurring','[]'::jsonb);
  v_name text := trim(coalesce(v_room_in->>'name',''));
  v_login text := lower(trim(coalesce(v_room_in->>'login_id','')));
  v_password text := coalesce(v_room_in->>'room_password','');
  v_legacy_id text := nullif(trim(coalesce(v_room_in->>'legacy_local_id','')),'');
  v_username text := lower(trim(coalesce(p_payload->>'login_username','')));
  v_current jsonb;
  v_current_count integer := 0;
  v_current_cloud_id uuid;
  v_room_id uuid;
  v_invite_code text;
  v_item jsonb;
  v_local_id text;
  v_cloud_id text;
  v_payer uuid;
  v_from uuid;
  v_to uuid;
  v_amount bigint;
  v_split_count integer;
  v_split_sum bigint;
  v_split_distinct integer;
  v_split_mapped integer;
  v_expense_count integer := 0;
  v_settlement_count integer := 0;
  v_recurring_count integer := 0;
  v_occurred timestamptz;
  v_updated timestamptz;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','Login required hai.'); end if;
  if length(v_name) < 1 or length(v_name) > 80 then return jsonb_build_object('ok',false,'error','Room ka sahi naam likho.'); end if;
  if v_login !~ '^[a-z0-9][a-z0-9-]{2,47}$' then return jsonb_build_object('ok',false,'error','Room Login ID format sahi nahi hai.'); end if;
  if length(v_password) < 8 or length(v_password) > 72 then return jsonb_build_object('ok',false,'error','Room Password 8 se 72 characters ka rakho.'); end if;
  if v_username !~ '^[a-z0-9][a-z0-9._-]{1,39}$' then return jsonb_build_object('ok',false,'error','Login username format sahi nahi hai.'); end if;
  if v_legacy_id is null or length(v_legacy_id) > 120 then return jsonb_build_object('ok',false,'error','Local room identity nahi mili.'); end if;

  if jsonb_typeof(v_members) <> 'array' or jsonb_array_length(v_members) < 1 or jsonb_array_length(v_members) > 8 then
    return jsonb_build_object('ok',false,'error','Migration me 1 se 8 members hone chahiye.');
  end if;
  if jsonb_typeof(v_expenses) <> 'array' or jsonb_array_length(v_expenses) > 1000 then
    return jsonb_build_object('ok',false,'error','Ek baar me max 1000 kharche migrate ho sakte hain.');
  end if;
  if jsonb_typeof(v_settlements) <> 'array' or jsonb_array_length(v_settlements) > 1000 then
    return jsonb_build_object('ok',false,'error','Ek baar me max 1000 settlements migrate ho sakte hain.');
  end if;
  if jsonb_typeof(v_recurring) <> 'array' or jsonb_array_length(v_recurring) > 100 then
    return jsonb_build_object('ok',false,'error','Ek baar me max 100 recurring bills migrate ho sakte hain.');
  end if;

  select count(*) into v_current_count
  from jsonb_array_elements(v_members) m
  where coalesce((m->>'is_current')::boolean,false);
  if v_current_count <> 1 then
    return jsonb_build_object('ok',false,'error','Migration ke liye exactly ek current member select karo.');
  end if;
  select m into v_current
  from jsonb_array_elements(v_members) m
  where coalesce((m->>'is_current')::boolean,false)
  limit 1;
  if coalesce((v_current->>'is_virtual')::boolean,false) then
    return jsonb_build_object('ok',false,'error','Virtual member ke naam par login nahi ban sakta.');
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_members) m
    where length(trim(coalesce(m->>'local_id',''))) < 1
       or length(trim(coalesce(m->>'local_id',''))) > 120
       or length(trim(coalesce(m->>'display_name',''))) < 1
       or length(trim(coalesce(m->>'display_name',''))) > 60
       or coalesce(m->>'cloud_member_id','') !~ '^[0-9a-fA-F-]{36}$'
       or (m ? 'details' and jsonb_typeof(m->'details') <> 'object')
  ) then
    return jsonb_build_object('ok',false,'error','Kisi member ki migration details sahi nahi hain.');
  end if;

  if (
    select count(distinct trim(m->>'local_id')) from jsonb_array_elements(v_members) m
  ) <> jsonb_array_length(v_members)
  or (
    select count(distinct lower(trim(m->>'display_name'))) from jsonb_array_elements(v_members) m
  ) <> jsonb_array_length(v_members)
  or (
    select count(distinct lower(m->>'cloud_member_id')) from jsonb_array_elements(v_members) m
  ) <> jsonb_array_length(v_members) then
    return jsonb_build_object('ok',false,'error','Member IDs ya nickname duplicate hain.');
  end if;

  v_current_cloud_id := (v_current->>'cloud_member_id')::uuid;

  drop table if exists pg_temp.rh_migration_member_map;
  create temp table rh_migration_member_map (
    local_id text primary key,
    cloud_id uuid not null unique
  ) on commit drop;
  insert into pg_temp.rh_migration_member_map(local_id, cloud_id)
  select trim(m->>'local_id'), (m->>'cloud_member_id')::uuid
  from jsonb_array_elements(v_members) m;

  begin
    insert into public.profiles(id, display_name, full_name, upi_id, phone, contact_email, preferred_upi_app, city, notes)
    values (
      v_user,
      trim(v_current->>'display_name'),
      nullif(v_current->'details'->>'fullName',''),
      nullif(lower(v_current->'details'->>'upiId'),''),
      nullif(v_current->'details'->>'phone',''),
      nullif(lower(v_current->'details'->>'email'),''),
      coalesce(nullif(v_current->'details'->>'preferredUpiApp',''),'any'),
      nullif(v_current->'details'->>'city',''),
      nullif(v_current->'details'->>'notes','')
    )
    on conflict (id) do update set
      display_name = excluded.display_name,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      upi_id = coalesce(excluded.upi_id, public.profiles.upi_id),
      phone = coalesce(excluded.phone, public.profiles.phone),
      contact_email = coalesce(excluded.contact_email, public.profiles.contact_email),
      preferred_upi_app = excluded.preferred_upi_app,
      city = coalesce(excluded.city, public.profiles.city),
      notes = coalesce(excluded.notes, public.profiles.notes);

    insert into public.rooms(name, login_id, created_by, rent_cycle_day, cycle_mode, cycle_start, cycle_end, legacy_local_id)
    values (
      v_name, v_login, v_user,
      least(28, greatest(1, coalesce((v_room_in->>'rent_cycle_day')::integer,1))),
      case when v_room_in->>'cycle_mode' = 'custom' then 'custom' else 'monthly' end,
      nullif(v_room_in->>'cycle_start','')::timestamptz,
      nullif(v_room_in->>'cycle_end','')::timestamptz,
      v_legacy_id
    )
    returning id, invite_code into v_room_id, v_invite_code;

    insert into public.room_secrets(room_id, password_hash)
    values (v_room_id, extensions.crypt(v_password, extensions.gen_salt('bf', 12)));

    insert into public.room_members(
      id, room_id, user_id, display_name, role, status, color_hex, login_username,
      is_virtual, joined_via, details, claimed_at, last_active_at, created_at, updated_at
    )
    select
      (m->>'cloud_member_id')::uuid,
      v_room_id,
      case when coalesce((m->>'is_current')::boolean,false) then v_user else null end,
      trim(m->>'display_name'),
      case when coalesce((m->>'is_current')::boolean,false) then 'owner' else 'member' end,
      case when coalesce((m->>'is_current')::boolean,false) or coalesce((m->>'is_virtual')::boolean,false) then 'active' else 'invited' end,
      coalesce(nullif(m->>'color_hex',''),'#5046C8'),
      case when coalesce((m->>'is_current')::boolean,false) then v_username else null end,
      coalesce((m->>'is_virtual')::boolean,false),
      'import',
      case when jsonb_typeof(m->'details') = 'object' then m->'details' else '{}'::jsonb end,
      case when coalesce((m->>'is_current')::boolean,false) then now() else null end,
      case when coalesce((m->>'is_current')::boolean,false) then now() else null end,
      now() + (ord * interval '1 millisecond'),
      now() + (ord * interval '1 millisecond')
    from jsonb_array_elements(v_members) with ordinality as x(m, ord);

    for v_item in select value from jsonb_array_elements(v_expenses) as value loop
      v_local_id := trim(coalesce(v_item->>'local_id',''));
      if length(v_local_id) < 3 or length(v_local_id) > 100 then
        raise exception 'Ek local expense ID sahi nahi hai.';
      end if;
      v_amount := (v_item->>'amount_paise')::bigint;
      if v_amount is null or v_amount <= 0 or v_amount > 1000000000 then
        raise exception 'Ek kharche ka amount sahi nahi hai.';
      end if;
      select cloud_id into v_payer from pg_temp.rh_migration_member_map where local_id = v_item->>'payer_local_id';
      if v_payer is null then raise exception 'Ek kharche ka payer room members me nahi mila.'; end if;
      if jsonb_typeof(coalesce(v_item->'splits','[]'::jsonb)) <> 'array' then
        raise exception 'Ek kharche ke splits sahi nahi hain.';
      end if;
      select count(*), coalesce(sum((s->>'amount_paise')::bigint),0), count(distinct s->>'member_local_id'), count(map.cloud_id)
        into v_split_count, v_split_sum, v_split_distinct, v_split_mapped
      from jsonb_array_elements(coalesce(v_item->'splits','[]'::jsonb)) s
      left join pg_temp.rh_migration_member_map map on map.local_id = s->>'member_local_id';
      if v_split_count < 1 or v_split_count > 8 or v_split_distinct <> v_split_count or v_split_mapped <> v_split_count or v_split_sum <> v_amount then
        raise exception 'Ek kharche ka split total amount se match nahi karta.';
      end if;

      v_cloud_id := 'mig-' || substr(encode(extensions.digest(v_room_id::text || ':expense:' || v_local_id,'sha256'),'hex'),1,40);
      v_occurred := to_timestamp(coalesce((v_item->>'occurred_at_ms')::double precision, extract(epoch from now())*1000)/1000);
      v_updated := to_timestamp(coalesce((v_item->>'updated_at_ms')::double precision, extract(epoch from v_occurred)*1000)/1000);

      insert into public.expenses(
        id, room_id, created_by_user_id, payer_member_id, description, category, amount_paise,
        method, split_mode, note, vendor_name, vendor_upi_id, instant_pay, source, confidence,
        status, photo_url, occurred_at, created_at, updated_at
      ) values (
        v_cloud_id, v_room_id, v_user, v_payer,
        trim(v_item->>'description'), v_item->>'category', v_amount,
        v_item->>'method', v_item->>'split_mode',
        nullif(v_item->>'note',''), nullif(v_item->>'vendor_name',''), nullif(lower(v_item->>'vendor_upi_id'),''),
        coalesce((v_item->>'instant_pay')::boolean,false), coalesce(nullif(v_item->>'source',''),'manual'),
        case when v_item ? 'confidence' and v_item->>'confidence' <> '' then (v_item->>'confidence')::smallint else null end,
        coalesce(nullif(v_item->>'status',''),'confirmed'), nullif(v_item->>'photo_url',''),
        v_occurred, v_occurred, v_updated
      );

      insert into public.expense_splits(expense_id, room_id, member_id, amount_paise, created_at, updated_at)
      select v_cloud_id, v_room_id, map.cloud_id, (s->>'amount_paise')::bigint, v_occurred, v_updated
      from jsonb_array_elements(v_item->'splits') s
      join pg_temp.rh_migration_member_map map on map.local_id = s->>'member_local_id';

      insert into public.expense_reactions(expense_id, room_id, member_id, emoji, created_at)
      select v_cloud_id, v_room_id, map.cloud_id, r.key, v_occurred
      from jsonb_each(coalesce(v_item->'reactions','{}'::jsonb)) r
      cross join lateral jsonb_array_elements_text(r.value) mid(value)
      join pg_temp.rh_migration_member_map map on map.local_id = mid.value
      on conflict do nothing;

      v_expense_count := v_expense_count + 1;
    end loop;

    for v_item in select value from jsonb_array_elements(v_settlements) as value loop
      v_local_id := trim(coalesce(v_item->>'local_id',''));
      if length(v_local_id) < 3 or length(v_local_id) > 100 then
        raise exception 'Ek local settlement ID sahi nahi hai.';
      end if;
      v_amount := (v_item->>'amount_paise')::bigint;
      if v_amount is null or v_amount <= 0 or v_amount > 1000000000 then
        raise exception 'Ek settlement ka amount sahi nahi hai.';
      end if;
      select cloud_id into v_from from pg_temp.rh_migration_member_map where local_id = v_item->>'from_local_id';
      select cloud_id into v_to from pg_temp.rh_migration_member_map where local_id = v_item->>'to_local_id';
      if v_from is null or v_to is null or v_from = v_to then
        raise exception 'Ek settlement ke members sahi nahi hain.';
      end if;
      v_cloud_id := 'mig-' || substr(encode(extensions.digest(v_room_id::text || ':settlement:' || v_local_id,'sha256'),'hex'),1,40);
      v_occurred := to_timestamp(coalesce((v_item->>'created_at_ms')::double precision, extract(epoch from now())*1000)/1000);

      insert into public.settlements(
        id, room_id, created_by_user_id, from_member_id, to_member_id, amount_paise, method, note, created_at, updated_at
      ) values (
        v_cloud_id, v_room_id,
        case when v_current_cloud_id in (v_from, v_to) then v_user else null end,
        v_from, v_to, v_amount, v_item->>'method', nullif(v_item->>'note',''), v_occurred, v_occurred
      );

      insert into public.settlement_confirmations(settlement_id, room_id, member_id, confirmed_at)
      select distinct v_cloud_id, v_room_id, map.cloud_id, v_occurred
      from jsonb_array_elements_text(coalesce(v_item->'confirmed_by_local_ids','[]'::jsonb)) mid(value)
      join pg_temp.rh_migration_member_map map on map.local_id = mid.value
      on conflict do nothing;

      v_settlement_count := v_settlement_count + 1;
    end loop;

    for v_item in select value from jsonb_array_elements(v_recurring) as value loop
      v_local_id := trim(coalesce(v_item->>'local_id',''));
      if length(v_local_id) < 3 or length(v_local_id) > 100 then
        raise exception 'Ek local recurring ID sahi nahi hai.';
      end if;
      v_amount := (v_item->>'amount_paise')::bigint;
      if v_amount is null or v_amount <= 0 or v_amount > 1000000000 then
        raise exception 'Ek recurring bill ka amount sahi nahi hai.';
      end if;
      select cloud_id into v_payer from pg_temp.rh_migration_member_map where local_id = v_item->>'payer_local_id';
      if v_payer is null then raise exception 'Ek recurring bill ka payer nahi mila.'; end if;
      v_cloud_id := 'mig-' || substr(encode(extensions.digest(v_room_id::text || ':recurring:' || v_local_id,'sha256'),'hex'),1,40);

      insert into public.recurring_expenses(
        id, room_id, created_by_user_id, payer_member_id, description, category, amount_paise,
        split_mode, day_of_month, method, active, last_run_key
      ) values (
        v_cloud_id, v_room_id, v_user, v_payer, trim(v_item->>'description'), v_item->>'category', v_amount,
        v_item->>'split_mode', least(28, greatest(1, coalesce((v_item->>'day_of_month')::smallint,1))),
        v_item->>'method', coalesce((v_item->>'active')::boolean,true), nullif(v_item->>'last_run_key','')
      );
      v_recurring_count := v_recurring_count + 1;
    end loop;
  exception
    when unique_violation then
      return jsonb_build_object('ok',false,'error','Yeh Room Login ID ya local room pehle hi cloud me migrate ho chuka hai. Login/Join se usi room me jao.');
    when others then
      return jsonb_build_object('ok',false,'error','Migration save nahi hua: ' || SQLERRM);
  end;

  return jsonb_build_object(
    'ok',true,
    'room_id',v_room_id,
    'room_login_id',v_login,
    'invite_code',v_invite_code,
    'member_id',v_current_cloud_id,
    'members',jsonb_array_length(v_members),
    'expenses',v_expense_count,
    'settlements',v_settlement_count,
    'recurring',v_recurring_count
  );
end;
$$;

revoke all on function public.migrate_local_room_to_cloud(jsonb) from public, anon;
grant execute on function public.migrate_local_room_to_cloud(jsonb) to authenticated;
