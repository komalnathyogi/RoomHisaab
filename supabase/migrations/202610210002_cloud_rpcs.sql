-- RoomHisaab cloud RPCs
-- Room password/invite secrets are never stored in plaintext.
-- SECURITY DEFINER functions below re-check auth.uid(), room membership and
-- owner/admin status before touching protected tables.

create or replace function public.create_cloud_room(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_name text := trim(coalesce(p_payload->>'name',''));
  v_login text := lower(trim(coalesce(p_payload->>'login_id','')));
  v_password text := coalesce(p_payload->>'room_password','');
  v_creator jsonb := coalesce(p_payload->'creator','{}'::jsonb);
  v_creator_name text := trim(coalesce(v_creator->>'display_name',''));
  v_creator_username text := lower(trim(coalesce(v_creator->>'login_username','')));
  v_room_id uuid;
  v_invite_code text;
  v_member_id uuid;
  v_member_ids uuid[] := array[]::uuid[];
  v_item jsonb;
  v_new_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','Login required hai.'); end if;
  if length(v_name) < 1 or length(v_name) > 80 then return jsonb_build_object('ok',false,'error','Room ka sahi naam likho.'); end if;
  if v_login !~ '^[a-z0-9][a-z0-9-]{2,47}$' then return jsonb_build_object('ok',false,'error','Room Login ID me sirf chhoti letters, number aur hyphen rakho.'); end if;
  if length(v_password) < 8 or length(v_password) > 72 then return jsonb_build_object('ok',false,'error','Room Password 8 se 72 characters ka rakho.'); end if;
  if length(v_creator_name) < 1 or length(v_creator_name) > 60 then return jsonb_build_object('ok',false,'error','Apna nickname likho.'); end if;
  if v_creator_username !~ '^[a-z0-9][a-z0-9._-]{1,39}$' then return jsonb_build_object('ok',false,'error','Login username format sahi nahi hai.'); end if;
  if jsonb_typeof(coalesce(p_payload->'initial_members','[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payload->'initial_members','[]'::jsonb)) > 7 then
    return jsonb_build_object('ok',false,'error','Ek room me max 8 members ho sakte hain.');
  end if;

  begin
    insert into public.profiles(id, display_name, full_name, upi_id, phone, contact_email, preferred_upi_app, city, notes)
    values (
      v_user, v_creator_name,
      nullif(v_creator->'details'->>'fullName',''),
      nullif(lower(v_creator->'details'->>'upiId'),''),
      nullif(v_creator->'details'->>'phone',''),
      nullif(lower(v_creator->'details'->>'email'),''),
      coalesce(nullif(v_creator->'details'->>'preferredUpiApp',''),'any'),
      nullif(v_creator->'details'->>'city',''),
      nullif(v_creator->'details'->>'notes','')
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
      least(28, greatest(1, coalesce((p_payload->>'rent_cycle_day')::integer,1))),
      case when p_payload->>'cycle_mode' = 'custom' then 'custom' else 'monthly' end,
      nullif(p_payload->>'cycle_start','')::timestamptz,
      nullif(p_payload->>'cycle_end','')::timestamptz,
      nullif(p_payload->>'legacy_local_id','')
    )
    returning id, invite_code into v_room_id, v_invite_code;

    insert into public.room_secrets(room_id, password_hash)
    values (v_room_id, extensions.crypt(v_password, extensions.gen_salt('bf', 12)));

    insert into public.room_members(
      room_id, user_id, display_name, role, status, color_hex, login_username,
      is_virtual, joined_via, details, claimed_at, last_active_at
    ) values (
      v_room_id, v_user, v_creator_name, 'owner', 'active',
      coalesce(nullif(v_creator->>'color_hex',''),'#5046C8'), v_creator_username,
      false, 'creator', case when jsonb_typeof(v_creator->'details')='object' then v_creator->'details' else '{}'::jsonb end,
      now(), now()
    ) returning id into v_member_id;
    v_member_ids := array_append(v_member_ids, v_member_id);

    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'initial_members','[]'::jsonb)) as value loop
      if length(trim(coalesce(v_item->>'display_name',''))) between 1 and 60
         and not exists (
           select 1 from public.room_members
           where room_id=v_room_id and status in ('active','invited')
             and lower(trim(display_name))=lower(trim(v_item->>'display_name'))
         ) then
        insert into public.room_members(room_id, display_name, role, status, color_hex, is_virtual, joined_via, details)
        values (
          v_room_id, trim(v_item->>'display_name'), 'member',
          case when coalesce((v_item->>'is_virtual')::boolean,false) then 'active' else 'invited' end,
          coalesce(nullif(v_item->>'color_hex',''),'#0D9488'),
          coalesce((v_item->>'is_virtual')::boolean,false), 'manual',
          case when jsonb_typeof(v_item->'details')='object' then v_item->'details' else '{}'::jsonb end
        ) returning id into v_new_id;
        v_member_ids := array_append(v_member_ids, v_new_id);
      end if;
    end loop;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','Yeh Room Login ID ya member username pehle se use ho raha hai. Thoda badal kar try karo.');
  end;

  return jsonb_build_object(
    'ok',true,'room_id',v_room_id,'room_login_id',v_login,
    'invite_code',v_invite_code,'member_id',v_member_id,'member_ids',to_jsonb(v_member_ids)
  );
end;
$$;

create or replace function public.create_room_invite(
  p_room_id uuid,
  p_target_member_id uuid default null,
  p_expires_days integer default 7,
  p_max_uses integer default 8
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
  if v_user is null then return jsonb_build_object('ok',false,'error','Login required hai.'); end if;
  if not public.is_room_admin(p_room_id) then
    return jsonb_build_object('ok',false,'error','Invite link sirf room admin/owner bana sakta hai.');
  end if;
  select login_id into v_login from public.rooms where id=p_room_id and archived_at is null;
  if v_login is null then return jsonb_build_object('ok',false,'error','Room nahi mila.'); end if;
  if p_target_member_id is not null and not exists (
    select 1 from public.room_members
    where id=p_target_member_id and room_id=p_room_id and user_id is null
      and status='invited' and not is_virtual
  ) then
    return jsonb_build_object('ok',false,'error','Invite ke liye selected member already claimed hai ya available nahi hai.');
  end if;

  v_expires := now() + make_interval(days => least(30, greatest(1, coalesce(p_expires_days,7))));
  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(32),'base64'),'+','-'),'/','_'),'=','');
  insert into public.room_invites(room_id, target_member_id, token_hash, created_by_user_id, expires_at, max_uses)
  values (
    p_room_id, p_target_member_id,
    encode(extensions.digest(v_token,'sha256'),'hex'),
    v_user, v_expires,
    case when p_target_member_id is not null then 1 else least(20,greatest(1,coalesce(p_max_uses,8))) end
  );
  return jsonb_build_object('ok',true,'token',v_token,'room_login_id',v_login,'expires_at',v_expires);
end;
$$;

create or replace function public.preview_room_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare v record;
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 200 then
    return jsonb_build_object('ok',false,'error','Invite link sahi nahi hai.');
  end if;
  select i.id as invite_id, i.expires_at, i.target_member_id, i.use_count, i.max_uses, i.failed_attempts,
         r.id as room_id, r.name as room_name, r.login_id, r.invite_code, r.max_members
    into v
  from public.room_invites i
  join public.rooms r on r.id=i.room_id
  where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and i.revoked_at is null and r.archived_at is null;
  if not found then return jsonb_build_object('ok',false,'error','Invite link galat hai ya band kar diya gaya hai.'); end if;
  if v.expires_at <= now() or v.use_count >= v.max_uses or v.failed_attempts >= 10 then
    return jsonb_build_object('ok',false,'error','Invite link expire/lock ho gaya hai. Admin se naya link maango.');
  end if;
  return jsonb_build_object(
    'ok',true,
    'room',jsonb_build_object('id',v.room_id,'name',v.room_name,'login_id',v.login_id,'invite_code',v.invite_code,'max_members',v.max_members),
    'target_member_id',v.target_member_id,
    'expires_at',v.expires_at,
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'display_name',m.display_name,'color_hex',m.color_hex,
        'role',m.role,'status',m.status,'is_virtual',m.is_virtual,
        'claimed',m.user_id is not null,
        'has_upi',nullif(m.details->>'upiId','') is not null
      ) order by m.created_at)
      from public.room_members m where m.room_id=v.room_id and m.status in ('active','invited')
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.claim_room_invite(
  p_token text,
  p_room_password text,
  p_member_id uuid default null,
  p_new_member jsonb default '{}'::jsonb,
  p_login_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_invite record;
  v_secret text;
  v_username text := lower(trim(coalesce(p_login_username,'')));
  v_member record;
  v_member_id uuid;
  v_existing uuid;
  v_details jsonb := case when jsonb_typeof(p_new_member->'details')='object' then p_new_member->'details' else '{}'::jsonb end;
  v_display text := trim(coalesce(p_new_member->>'display_name',''));
  v_count integer;
  v_previous uuid;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','Pehle apna member login banao.'); end if;
  if v_username !~ '^[a-z0-9][a-z0-9._-]{1,39}$' then
    return jsonb_build_object('ok',false,'error','Login username format sahi nahi hai.');
  end if;

  select i.*, r.name as room_name, r.login_id, r.max_members
    into v_invite
  from public.room_invites i
  join public.rooms r on r.id=i.room_id
  where i.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    and i.revoked_at is null and r.archived_at is null
  for update of i;
  if not found then return jsonb_build_object('ok',false,'error','Invite link galat hai ya band hai.'); end if;
  if v_invite.expires_at <= now() or v_invite.use_count >= v_invite.max_uses or v_invite.failed_attempts >= 10 then
    return jsonb_build_object('ok',false,'error','Invite link expire/lock ho gaya hai. Admin se naya link maango.');
  end if;

  select password_hash into v_secret from public.room_secrets where room_id=v_invite.room_id;
  if v_secret is null or extensions.crypt(coalesce(p_room_password,''), v_secret) <> v_secret then
    update public.room_invites set failed_attempts=failed_attempts+1 where id=v_invite.id;
    return jsonb_build_object('ok',false,'error','Room Password galat hai.');
  end if;

  select id into v_existing from public.room_members
  where room_id=v_invite.room_id and user_id=v_user and status='active' and not is_virtual;
  if v_existing is not null then
    update public.room_members set last_active_at=now() where id=v_existing;
    return jsonb_build_object('ok',true,'already_member',true,'room_id',v_invite.room_id,'room_login_id',v_invite.login_id,'member_id',v_existing);
  end if;

  if exists (
    select 1 from public.room_members
    where room_id=v_invite.room_id and lower(login_username)=v_username and status in ('active','invited')
  ) then
    return jsonb_build_object('ok',false,'error','Yeh username is room me pehle se hai. Doosra username rakho.');
  end if;

  begin
    if p_member_id is not null then
      if v_invite.target_member_id is not null and v_invite.target_member_id <> p_member_id then
        return jsonb_build_object('ok',false,'error','Yeh invite kisi specific member ke liye hai.');
      end if;
      select * into v_member from public.room_members
      where id=p_member_id and room_id=v_invite.room_id
      for update;
      if not found or v_member.is_virtual then return jsonb_build_object('ok',false,'error','Selected member nahi mila.'); end if;
      if v_member.user_id is not null or v_member.status <> 'invited' then
        return jsonb_build_object('ok',false,'error','Yeh member pehle hi claimed hai. Apne login se Login page par jao.');
      end if;
      if v_display <> '' and lower(v_display) <> lower(v_member.display_name) and exists (
        select 1 from public.room_members where room_id=v_invite.room_id and id<>v_member.id
          and status in ('active','invited') and lower(trim(display_name))=lower(v_display)
      ) then
        return jsonb_build_object('ok',false,'error','Yeh nickname room me pehle se hai.');
      end if;
      v_previous := v_member.previous_user_id;
      update public.room_members set
        user_id=v_user, status='active', login_username=v_username,
        display_name=case when v_display='' then display_name else v_display end,
        details=details || v_details, joined_via='invite', claimed_at=now(), last_active_at=now(), previous_user_id=null
      where id=v_member.id
      returning id into v_member_id;
      if v_previous is not null and v_previous <> v_user then
        update public.expenses set created_by_user_id=v_user where room_id=v_invite.room_id and payer_member_id=v_member_id and created_by_user_id=v_previous;
        update public.recurring_expenses set created_by_user_id=v_user where room_id=v_invite.room_id and payer_member_id=v_member_id and created_by_user_id=v_previous;
        update public.settlements set created_by_user_id=v_user where room_id=v_invite.room_id and created_by_user_id=v_previous and v_member_id in (from_member_id,to_member_id);
      end if;
    else
      if v_invite.target_member_id is not null then
        return jsonb_build_object('ok',false,'error','Yeh invite kisi specific member ke liye hai.');
      end if;
      if length(v_display) < 1 or length(v_display) > 60 then
        return jsonb_build_object('ok',false,'error','Apna nickname likho.');
      end if;
      select count(*) into v_count from public.room_members where room_id=v_invite.room_id and status in ('active','invited');
      if v_count >= v_invite.max_members then return jsonb_build_object('ok',false,'error','Room full hai — max 8 members.'); end if;
      insert into public.room_members(room_id,user_id,display_name,role,status,color_hex,login_username,joined_via,details,claimed_at,last_active_at)
      values (
        v_invite.room_id,v_user,v_display,'member','active',
        coalesce(nullif(p_new_member->>'color_hex',''),'#0D9488'),v_username,'invite',v_details,now(),now()
      ) returning id into v_member_id;
    end if;

    insert into public.profiles(id, display_name, full_name, upi_id, phone, contact_email, preferred_upi_app, city, notes)
    select v_user, display_name, nullif(details->>'fullName',''), nullif(lower(details->>'upiId'),''),
           nullif(details->>'phone',''), nullif(lower(details->>'email'),''),
           coalesce(nullif(details->>'preferredUpiApp',''),'any'), nullif(details->>'city',''), nullif(details->>'notes','')
    from public.room_members where id=v_member_id
    on conflict (id) do update set display_name=excluded.display_name;

    update public.room_invites set use_count=use_count+1, last_used_at=now() where id=v_invite.id;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','Nickname ya username pehle se use ho raha hai.');
  end;

  return jsonb_build_object('ok',true,'room_id',v_invite.room_id,'room_login_id',v_invite.login_id,'member_id',v_member_id);
end;
$$;

create or replace function public.add_room_member_placeholder(
  p_room_id uuid, p_display_name text, p_details jsonb default '{}'::jsonb,
  p_is_virtual boolean default false, p_color_hex text default '#5046C8'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_count int; v_max int;
begin
  if not public.is_room_admin(p_room_id) then return jsonb_build_object('ok',false,'error','Member placeholder sirf room admin/owner add kar sakta hai.'); end if;
  if length(trim(coalesce(p_display_name,''))) < 1 or length(trim(p_display_name)) > 60 then return jsonb_build_object('ok',false,'error','Member ka sahi naam likho.'); end if;
  select max_members into v_max from public.rooms where id=p_room_id;
  select count(*) into v_count from public.room_members where room_id=p_room_id and status in ('active','invited');
  if v_count >= coalesce(v_max,8) then return jsonb_build_object('ok',false,'error','Room full hai — max 8 members.'); end if;
  begin
    insert into public.room_members(room_id,display_name,role,status,color_hex,is_virtual,joined_via,details)
    values (p_room_id,trim(p_display_name),'member',case when p_is_virtual then 'active' else 'invited' end,
      coalesce(nullif(p_color_hex,''),'#5046C8'),p_is_virtual,'manual',
      case when jsonb_typeof(p_details)='object' then p_details else '{}'::jsonb end)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','Is naam ka member pehle se hai.');
  end;
  return jsonb_build_object('ok',true,'member_id',v_id);
end;
$$;

create or replace function public.update_my_member_profile(
  p_room_id uuid, p_display_name text, p_color_hex text, p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := public.current_room_member_id(p_room_id);
begin
  if v_id is null then return jsonb_build_object('ok',false,'error','Apni membership nahi mili.'); end if;
  if length(trim(coalesce(p_display_name,''))) < 1 or length(trim(p_display_name)) > 60 then return jsonb_build_object('ok',false,'error','Nickname sahi likho.'); end if;
  begin
    update public.room_members set
      display_name=trim(p_display_name),
      color_hex=coalesce(nullif(p_color_hex,''),color_hex),
      details=case when jsonb_typeof(p_details)='object' then p_details else details end,
      last_active_at=now()
    where id=v_id;
    update public.profiles set
      display_name=trim(p_display_name),
      full_name=nullif(p_details->>'fullName',''),
      upi_id=nullif(lower(p_details->>'upiId'),''),
      phone=nullif(p_details->>'phone',''),
      contact_email=nullif(lower(p_details->>'email'),''),
      preferred_upi_app=coalesce(nullif(p_details->>'preferredUpiApp',''),'any'),
      city=nullif(p_details->>'city',''), notes=nullif(p_details->>'notes','')
    where id=auth.uid();
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','Yeh nickname room me pehle se hai.');
  end;
  return jsonb_build_object('ok',true,'member_id',v_id);
end;
$$;

create or replace function public.update_placeholder_member(
  p_member_id uuid, p_display_name text, p_color_hex text,
  p_details jsonb default '{}'::jsonb, p_is_virtual boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_room uuid;
begin
  select room_id into v_room from public.room_members where id=p_member_id and user_id is null;
  if v_room is null then return jsonb_build_object('ok',false,'error','Claimed member ki profile sirf wahi member badal sakta hai.'); end if;
  if not public.is_room_admin(v_room) then return jsonb_build_object('ok',false,'error','Placeholder sirf room admin/owner badal sakta hai.'); end if;
  begin
    update public.room_members set
      display_name=trim(p_display_name), color_hex=coalesce(nullif(p_color_hex,''),color_hex),
      details=case when jsonb_typeof(p_details)='object' then p_details else details end,
      is_virtual=p_is_virtual, status=case when p_is_virtual then 'active' else 'invited' end
    where id=p_member_id and user_id is null;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'error','Yeh nickname room me pehle se hai.');
  end;
  return jsonb_build_object('ok',true,'member_id',p_member_id,'room_id',v_room);
end;
$$;

create or replace function public.update_room_settings(p_room_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_admin(p_room_id) then return jsonb_build_object('ok',false,'error','Room settings sirf admin/owner badal sakta hai.'); end if;
  update public.rooms set
    name=case when p_patch ? 'name' and length(trim(p_patch->>'name')) between 1 and 80 then trim(p_patch->>'name') else name end,
    rent_cycle_day=case when p_patch ? 'rent_cycle_day' then least(28,greatest(1,(p_patch->>'rent_cycle_day')::integer)) else rent_cycle_day end,
    cycle_mode=case when p_patch ? 'cycle_mode' and p_patch->>'cycle_mode' in ('monthly','custom') then p_patch->>'cycle_mode' else cycle_mode end,
    cycle_start=case when p_patch ? 'cycle_start' then nullif(p_patch->>'cycle_start','')::timestamptz else cycle_start end,
    cycle_end=case when p_patch ? 'cycle_end' then nullif(p_patch->>'cycle_end','')::timestamptz else cycle_end end
  where id=p_room_id;
  return jsonb_build_object('ok',true,'room_id',p_room_id);
end;
$$;

create or replace function public.change_room_password(
  p_room_id uuid, p_current_password text, p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_hash text;
begin
  if not public.is_room_admin(p_room_id) then return jsonb_build_object('ok',false,'error','Room Password sirf admin/owner badal sakta hai.'); end if;
  if length(coalesce(p_new_password,'')) < 8 or length(p_new_password) > 72 then return jsonb_build_object('ok',false,'error','Naya Room Password 8 se 72 characters ka rakho.'); end if;
  select password_hash into v_hash from public.room_secrets where room_id=p_room_id;
  if v_hash is null or extensions.crypt(coalesce(p_current_password,''),v_hash) <> v_hash then
    return jsonb_build_object('ok',false,'error','Current Room Password galat hai.');
  end if;
  update public.room_secrets set password_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf',12)), password_changed_at=now() where room_id=p_room_id;
  update public.room_invites set revoked_at=now() where room_id=p_room_id and revoked_at is null;
  return jsonb_build_object('ok',true,'room_id',p_room_id);
end;
$$;

create or replace function public.reset_member_login(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v record; v_actor_role text;
begin
  select * into v from public.room_members where id=p_member_id;
  if not found or v.user_id is null then return jsonb_build_object('ok',false,'error','Claimed member nahi mila.'); end if;
  if v.user_id = auth.uid() then return jsonb_build_object('ok',false,'error','Khud ka login reset khud nahi kar sakte — dusre admin se karao.'); end if;
  if not public.is_room_admin(v.room_id) then return jsonb_build_object('ok',false,'error','Login reset sirf admin/owner kar sakta hai.'); end if;
  select role into v_actor_role from public.room_members where room_id=v.room_id and user_id=auth.uid() and status='active';
  if v.role='owner' and v_actor_role <> 'owner' then return jsonb_build_object('ok',false,'error','Owner ka login sirf owner reset kar sakta hai.'); end if;
  update public.room_members set previous_user_id=user_id, user_id=null, status='invited', login_username=null, claimed_at=null where id=p_member_id;
  return jsonb_build_object('ok',true,'member_id',p_member_id,'room_id',v.room_id);
end;
$$;

create or replace function public.touch_my_membership(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := public.current_room_member_id(p_room_id);
begin
  if v_id is null then return jsonb_build_object('ok',false,'error','Membership nahi mili.'); end if;
  update public.room_members set last_active_at=now() where id=v_id;
  return jsonb_build_object('ok',true,'member_id',v_id);
end;
$$;

create or replace function public.upsert_expense_with_splits(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id text := p_payload->>'id';
  v_room uuid := (p_payload->>'room_id')::uuid;
  v_amount bigint := (p_payload->>'amount_paise')::bigint;
  v_sum bigint;
  v_split_count int;
  v_valid_members int;
  v_return_id text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'error','Login required hai.'); end if;
  if v_id is null or v_room is null or v_amount is null or v_amount <= 0 then
    return jsonb_build_object('ok',false,'error','Expense data incomplete hai.');
  end if;
  if jsonb_typeof(p_payload->'splits') <> 'array' then return jsonb_build_object('ok',false,'error','Splits missing hain.'); end if;
  select count(*), coalesce(sum((s->>'amount_paise')::bigint),0), count(distinct s->>'member_id')
    into v_split_count, v_sum, v_valid_members
  from jsonb_array_elements(p_payload->'splits') s;
  if v_split_count < 1 or v_split_count > 8 or v_valid_members <> v_split_count or v_sum <> v_amount then
    return jsonb_build_object('ok',false,'error','Split ka total expense amount ke barabar hona chahiye.');
  end if;
  select count(*) into v_valid_members
  from jsonb_array_elements(p_payload->'splits') s
  join public.room_members m on m.id=(s->>'member_id')::uuid and m.room_id=v_room
  where m.status <> 'removed';
  if v_valid_members <> v_split_count then return jsonb_build_object('ok',false,'error','Split me room ke bahar ka member hai.'); end if;
  if exists (select 1 from public.expenses where id=v_id and room_id<>v_room) then
    return jsonb_build_object('ok',false,'error','Expense ID dusre room me already hai.');
  end if;
  if exists (select 1 from public.expenses where id=v_id)
     and not public.expense_payer_is_current_user(v_id) then
    return jsonb_build_object('ok',false,'error','Dusre member ka kharcha edit nahi ho sakta.');
  end if;

  insert into public.expenses(
    id,room_id,created_by_user_id,payer_member_id,description,category,amount_paise,method,split_mode,
    note,vendor_name,vendor_upi_id,instant_pay,source,confidence,status,photo_url,occurred_at,deleted_at
  ) values (
    v_id,v_room,v_user,(p_payload->>'payer_member_id')::uuid,
    trim(p_payload->>'description'),p_payload->>'category',v_amount,p_payload->>'method',p_payload->>'split_mode',
    nullif(p_payload->>'note',''),nullif(p_payload->>'vendor_name',''),nullif(lower(p_payload->>'vendor_upi_id'),''),
    coalesce((p_payload->>'instant_pay')::boolean,false),coalesce(nullif(p_payload->>'source',''),'manual'),
    case when p_payload ? 'confidence' and p_payload->>'confidence' <> '' then (p_payload->>'confidence')::smallint else null end,
    coalesce(nullif(p_payload->>'status',''),'confirmed'),nullif(p_payload->>'photo_url',''),
    to_timestamp(coalesce((p_payload->>'occurred_at_ms')::double precision, extract(epoch from now())*1000)/1000),
    case when coalesce((p_payload->>'deleted')::boolean,false) then now() else null end
  )
  on conflict (id) do update set
    payer_member_id=excluded.payer_member_id, description=excluded.description, category=excluded.category,
    amount_paise=excluded.amount_paise, method=excluded.method, split_mode=excluded.split_mode,
    note=excluded.note, vendor_name=excluded.vendor_name, vendor_upi_id=excluded.vendor_upi_id,
    instant_pay=excluded.instant_pay, source=excluded.source, confidence=excluded.confidence,
    status=excluded.status, photo_url=excluded.photo_url, occurred_at=excluded.occurred_at,
    deleted_at=excluded.deleted_at, version=public.expenses.version+1, updated_at=now()
  where public.expenses.room_id=excluded.room_id
  returning id into v_return_id;
  if v_return_id is null then return jsonb_build_object('ok',false,'error','Expense save nahi hua. Permission check karo.'); end if;

  delete from public.expense_splits where expense_id=v_id;
  insert into public.expense_splits(expense_id,room_id,member_id,amount_paise)
  select v_id,v_room,(s->>'member_id')::uuid,(s->>'amount_paise')::bigint
  from jsonb_array_elements(p_payload->'splits') s;
  return jsonb_build_object('ok',true,'expense_id',v_id);
end;
$$;

revoke all on function public.create_cloud_room(jsonb) from public, anon;
revoke all on function public.create_room_invite(uuid,uuid,integer,integer) from public, anon;
revoke all on function public.claim_room_invite(text,text,uuid,jsonb,text) from public, anon;
revoke all on function public.add_room_member_placeholder(uuid,text,jsonb,boolean,text) from public, anon;
revoke all on function public.update_my_member_profile(uuid,text,text,jsonb) from public, anon;
revoke all on function public.update_placeholder_member(uuid,text,text,jsonb,boolean) from public, anon;
revoke all on function public.update_room_settings(uuid,jsonb) from public, anon;
revoke all on function public.change_room_password(uuid,text,text) from public, anon;
revoke all on function public.reset_member_login(uuid) from public, anon;
revoke all on function public.touch_my_membership(uuid) from public, anon;
revoke all on function public.upsert_expense_with_splits(jsonb) from public, anon;
revoke all on function public.preview_room_invite(text) from public;

grant execute on function public.create_cloud_room(jsonb) to authenticated;
grant execute on function public.create_room_invite(uuid,uuid,integer,integer) to authenticated;
grant execute on function public.claim_room_invite(text,text,uuid,jsonb,text) to authenticated;
grant execute on function public.add_room_member_placeholder(uuid,text,jsonb,boolean,text) to authenticated;
grant execute on function public.update_my_member_profile(uuid,text,text,jsonb) to authenticated;
grant execute on function public.update_placeholder_member(uuid,text,text,jsonb,boolean) to authenticated;
grant execute on function public.update_room_settings(uuid,jsonb) to authenticated;
grant execute on function public.change_room_password(uuid,text,text) to authenticated;
grant execute on function public.reset_member_login(uuid) to authenticated;
grant execute on function public.touch_my_membership(uuid) to authenticated;
grant execute on function public.upsert_expense_with_splits(jsonb) to authenticated;
grant execute on function public.preview_room_invite(text) to anon, authenticated;
