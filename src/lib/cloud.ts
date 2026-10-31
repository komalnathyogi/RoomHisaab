// ─────────────────────────────────────────────────────────────
// CLOUD API — Supabase <-> RoomHisaab AppState mapping
// UI purane local store par hi chalti hai; yeh layer snapshot ko
// normalized cloud tables me badalti hai. Permissions server RLS/RPC
// se enforce hoti hain, frontend sirf achhi UX deta hai.
// ─────────────────────────────────────────────────────────────
import type { Session, User } from '@supabase/supabase-js'
import type { AppState, Expense, Member, Recurring, Settlement } from './types'
import { colorFromName } from './constants'
import { emptyState } from './storage'
import {
  cloudErrorMessage,
  memberAuthEmail,
  normalizeLoginUsername,
  normalizeRoomLoginId,
  requireSupabase,
} from './supabase'
import {
  CLOUD_META_STORAGE_KEY,
  getPreferredAuthStorage,
  getRememberDevicePreference,
  saveLastLoginHint,
} from './authPersistence'
import { stableExpenses, stableMembers } from './members'
import { hashRecoveryKey } from './recovery'

export interface CloudMeta {
  roomId: string
  memberId: string
  roomLoginId: string
  username: string
  userId: string
  role: 'owner' | 'admin' | 'member'
}

export interface CloudMembershipSummary {
  roomId: string
  memberId: string
  roomName: string
  roomLoginId: string
  inviteCode: string
  username: string
  role: 'owner' | 'admin' | 'member'
}

export interface CloudInvitePreviewMember {
  id: string
  display_name: string
  color_hex: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'invited'
  is_virtual: boolean
  claimed: boolean
  has_upi: boolean
}

export interface CloudInvitePreview {
  ok: boolean
  error?: string
  room?: { id: string; name: string; login_id: string; invite_code: string; max_members: number }
  target_member_id?: string | null
  expires_at?: string
  members?: CloudInvitePreviewMember[]
}

const META_KEY = CLOUD_META_STORAGE_KEY

export function loadCloudMeta(): CloudMeta | null {
  try {
    const raw = getPreferredAuthStorage()?.getItem(META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CloudMeta>
    if (!parsed.roomId || !parsed.memberId || !parsed.userId) return null
    return {
      roomId: parsed.roomId,
      memberId: parsed.memberId,
      roomLoginId: parsed.roomLoginId ?? '',
      username: parsed.username ?? '',
      userId: parsed.userId,
      role: parsed.role ?? 'member',
    }
  } catch {
    return null
  }
}

export function saveCloudMeta(meta: CloudMeta): void {
  const remember = getRememberDevicePreference()
  const selected = getPreferredAuthStorage()
  try { selected?.setItem(META_KEY, JSON.stringify(meta)) } catch { /* private mode */ }
  try {
    const other = remember ? window.sessionStorage : window.localStorage
    other.removeItem(META_KEY)
  } catch { /* ignore */ }
  // Form fast khulne ke liye sirf Room ID + username hint rakho; password kabhi nahi.
  saveLastLoginHint({ roomLoginId: meta.roomLoginId, username: meta.username }, remember)
}

export function clearCloudMeta(): void {
  try { window.localStorage.removeItem(META_KEY) } catch { /* ignore */ }
  try { window.sessionStorage.removeItem(META_KEY) } catch { /* ignore */ }
}

type Row = Record<string, unknown>
type Json = Record<string, unknown>

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function dateMs(value: unknown, fallback = Date.now()): number {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : fallback
}

function cleanDetails(input?: Partial<Member> | null): Json {
  const out: Json = {}
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return
    out[key] = value
  }
  put('fullName', input?.fullName?.trim())
  put('upiId', input?.upiId?.trim().toLowerCase())
  put('phone', input?.phone?.trim())
  put('email', input?.email?.trim().toLowerCase())
  put('preferredUpiApp', input?.preferredUpiApp ?? 'any')
  put('quickOpenUpi', input?.quickOpenUpi ?? false)
  put('defaultSharePercent', input?.defaultSharePercent)
  put('monthlyBudgetPaise', input?.monthlyBudgetPaise)
  put('city', input?.city?.trim())
  put('notes', input?.notes?.trim())
  return out
}

export function memberToDetails(member: Partial<Member>): Json {
  return cleanDetails(member)
}

function newCloudUuid(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const bytes = new Uint8Array(16)
  c?.getRandomValues?.(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function memberFromRow(row: Row): Member {
  const d = (row.details && typeof row.details === 'object' ? row.details : {}) as Row
  const name = asString(row.display_name, 'Roomie')
  const role = row.role === 'owner' ? 'owner' : row.role === 'admin' ? 'admin' : 'member'
  return {
    id: asString(row.id),
    name,
    fullName: asString(d.fullName) || undefined,
    color: asString(row.color_hex, colorFromName(name)),
    upiId: asString(d.upiId) || undefined,
    phone: asString(d.phone) || undefined,
    email: asString(d.email) || undefined,
    preferredUpiApp: (asString(d.preferredUpiApp, 'any') as Member['preferredUpiApp']) ?? 'any',
    quickOpenUpi: d.quickOpenUpi === true,
    defaultSharePercent: d.defaultSharePercent == null ? undefined : asNumber(d.defaultSharePercent),
    monthlyBudgetPaise: d.monthlyBudgetPaise == null ? undefined : asNumber(d.monthlyBudgetPaise),
    city: asString(d.city) || undefined,
    notes: asString(d.notes) || undefined,
    isVirtual: Boolean(row.is_virtual),
    role,
    joinedVia: (asString(row.joined_via, 'invite') as Member['joinedVia']) ?? 'invite',
    lastActiveAt: row.last_active_at ? dateMs(row.last_active_at) : undefined,
    joinedAt: dateMs(row.joined_at ?? row.created_at),
    userId: row.user_id ? asString(row.user_id) : null,
    loginUsername: asString(row.login_username) || undefined,
    claimed: Boolean(row.user_id),
    cloudStatus: (asString(row.status, 'active') as Member['cloudStatus']) ?? 'active',
  }
}

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw error
  return data as T
}

async function rpcOk(name: string, args: Record<string, unknown>): Promise<Json> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc(name, args)
  if (error) throw error
  const result = (data && typeof data === 'object' ? data : {}) as Json
  if (result.ok === false) throw new Error(asString(result.error, 'The cloud action failed.'))
  return result
}

export async function getCloudSession(): Promise<Session | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.auth.getSession()
  if (error) throw error
  return data.session
}

export async function getCloudUser(): Promise<User | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.auth.getUser()
  if (error) return null
  return data.user
}

export async function fetchMyMemberships(userId?: string): Promise<CloudMembershipSummary[]> {
  const sb = requireSupabase()
  const uid = userId ?? (await getCloudUser())?.id
  if (!uid) return []
  const data = await unwrap<unknown[]>(
    sb.from('room_members')
      .select('id,room_id,display_name,role,status,login_username,rooms!inner(id,name,login_id,invite_code)')
      .eq('user_id', uid)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  )
  return (data as Row[]).map((row) => {
    const room = (row.rooms && typeof row.rooms === 'object' ? row.rooms : {}) as Row
    return {
      roomId: asString(row.room_id),
      memberId: asString(row.id),
      roomName: asString(room.name, 'Room'),
      roomLoginId: asString(room.login_id),
      inviteCode: asString(room.invite_code),
      username: asString(row.login_username),
      role: row.role === 'owner' ? 'owner' : row.role === 'admin' ? 'admin' : 'member',
    }
  })
}

export async function fetchCloudRoomSnapshot(
  roomId: string,
  localState: AppState,
): Promise<{ state: AppState; meta: CloudMeta }> {
  const sb = requireSupabase()
  const user = await getCloudUser()
  if (!user) throw new Error('Your login session expired. Sign in again.')

  const [roomRow, memberRows, expenseRows, splitRows, reactionRows, settlementRows, confirmationRows, recurringRows] = await Promise.all([
    unwrap<unknown>(sb.from('rooms').select('*').eq('id', roomId).single()),
    unwrap<unknown[]>(sb.from('room_members').select('*').eq('room_id', roomId).neq('status', 'removed').order('created_at').order('id')),
    unwrap<unknown[]>(sb.from('expenses').select('*').eq('room_id', roomId).is('deleted_at', null).order('occurred_at', { ascending: false }).order('id').limit(1000)),
    unwrap<unknown[]>(sb.from('expense_splits').select('*').eq('room_id', roomId).order('expense_id').order('member_id').limit(10000)),
    unwrap<unknown[]>(sb.from('expense_reactions').select('*').eq('room_id', roomId).order('expense_id').order('member_id').order('emoji').limit(10000)),
    unwrap<unknown[]>(sb.from('settlements').select('*').eq('room_id', roomId).is('deleted_at', null).order('created_at', { ascending: false }).order('id').limit(1000)),
    unwrap<unknown[]>(sb.from('settlement_confirmations').select('*').eq('room_id', roomId).order('settlement_id').order('member_id').limit(10000)),
    unwrap<unknown[]>(sb.from('recurring_expenses').select('*').eq('room_id', roomId).order('created_at').order('id')),
  ])

  const roomData = roomRow as Row
  const members = stableMembers((memberRows as Row[]).map(memberFromRow))
  const me = members.find((m) => m.userId === user.id && m.cloudStatus === 'active' && !m.isVirtual)
  if (!me) throw new Error('Your active membership for this room was not found.')

  const splitsByExpense = new Map<string, { memberId: string; paise: number }[]>()
  for (const row of splitRows as Row[]) {
    const expenseId = asString(row.expense_id)
    const list = splitsByExpense.get(expenseId) ?? []
    list.push({ memberId: asString(row.member_id), paise: asNumber(row.amount_paise) })
    splitsByExpense.set(expenseId, list)
  }

  const reactionsByExpense = new Map<string, Record<string, string[]>>()
  for (const row of reactionRows as Row[]) {
    const expenseId = asString(row.expense_id)
    const emoji = asString(row.emoji)
    const current = reactionsByExpense.get(expenseId) ?? {}
    current[emoji] = [...(current[emoji] ?? []), asString(row.member_id)]
    reactionsByExpense.set(expenseId, current)
  }

  const localExpenseById = new Map(localState.expenses.map((e) => [e.id, e]))
  const expenses: Expense[] = stableExpenses((expenseRows as Row[]).map((row) => {
    const id = asString(row.id)
    const local = localExpenseById.get(id)
    return {
      id,
      roomId,
      description: asString(row.description, 'Expense'),
      category: asString(row.category, 'other') as Expense['category'],
      amountPaise: asNumber(row.amount_paise),
      payerId: asString(row.payer_member_id),
      createdByUserId: asString(row.created_by_user_id) || undefined,
      method: asString(row.method, 'upi') as Expense['method'],
      splitMode: asString(row.split_mode, 'equal') as Expense['splitMode'],
      splits: splitsByExpense.get(id) ?? [],
      photoUrl: asString(row.photo_url) || local?.photoUrl,
      note: asString(row.note) || undefined,
      vendorName: asString(row.vendor_name) || undefined,
      vendorUpiId: asString(row.vendor_upi_id) || undefined,
      instantPay: Boolean(row.instant_pay),
      source: asString(row.source, 'manual') as Expense['source'],
      confidence: row.confidence == null ? undefined : asNumber(row.confidence),
      status: asString(row.status, 'confirmed') as Expense['status'],
      rawText: local?.rawText, // bank SMS cloud me upload nahi karte; device par hi rakho
      reactions: reactionsByExpense.get(id) ?? {},
      createdAt: dateMs(row.occurred_at),
      updatedAt: dateMs(row.updated_at),
      version: asNumber(row.version, 1),
      deleted: false,
    }
  }))

  const confirmationsBySettlement = new Map<string, string[]>()
  for (const row of confirmationRows as Row[]) {
    const id = asString(row.settlement_id)
    confirmationsBySettlement.set(id, [...(confirmationsBySettlement.get(id) ?? []), asString(row.member_id)])
  }
  const settlements: Settlement[] = (settlementRows as Row[]).map((row) => ({
    id: asString(row.id),
    roomId,
    fromId: asString(row.from_member_id),
    toId: asString(row.to_member_id),
    amountPaise: asNumber(row.amount_paise),
    method: asString(row.method, 'upi') as Settlement['method'],
    confirmedBy: confirmationsBySettlement.get(asString(row.id)) ?? [],
    note: asString(row.note) || undefined,
    createdAt: dateMs(row.created_at),
  }))

  const recurring: Recurring[] = (recurringRows as Row[]).map((row) => ({
    id: asString(row.id),
    roomId,
    description: asString(row.description, 'Recurring'),
    category: asString(row.category, 'other') as Recurring['category'],
    amountPaise: asNumber(row.amount_paise),
    payerId: asString(row.payer_member_id),
    splitMode: asString(row.split_mode, 'equal') as Recurring['splitMode'],
    dayOfMonth: asNumber(row.day_of_month, 1),
    method: asString(row.method, 'upi') as Recurring['method'],
    active: Boolean(row.active),
    lastRunKey: asString(row.last_run_key) || undefined,
  }))

  const base = emptyState()
  const state: AppState = {
    ...base,
    room: {
      id: roomId,
      name: asString(roomData.name, 'Room'),
      code: asString(roomData.invite_code),
      loginId: asString(roomData.login_id),
      cloud: true,
      rentCycleDay: asNumber(roomData.rent_cycle_day, 1),
      cycleMode: roomData.cycle_mode === 'custom' ? 'custom' : 'monthly',
      cycleStart: roomData.cycle_start ? dateMs(roomData.cycle_start) : undefined,
      cycleEnd: roomData.cycle_end ? dateMs(roomData.cycle_end) : undefined,
      createdAt: dateMs(roomData.created_at),
      updatedAt: dateMs(roomData.updated_at),
    },
    members,
    expenses,
    settlements,
    recurring,
    // Inbox, merchant memory aur automation rules personal/device data hain.
    rules: localState.rules,
    merchants: localState.merchants,
    inbox: localState.inbox,
    profile: {
      ...localState.profile,
      id: user.id,
      memberId: me.id,
      name: me.name,
      onboarded: true,
    },
  }

  return {
    state,
    meta: {
      roomId,
      memberId: me.id,
      roomLoginId: asString(roomData.login_id),
      username: me.loginUsername ?? '',
      userId: user.id,
      role: me.role ?? 'member',
    },
  }
}

async function signUpOrSignInMember(args: {
  roomLoginId: string
  username: string
  password: string
  displayName: string
}): Promise<User> {
  const sb = requireSupabase()
  const roomLoginId = normalizeRoomLoginId(args.roomLoginId)
  const username = normalizeLoginUsername(args.username)
  if (!roomLoginId || !username) throw new Error('The Room Login ID or username format is invalid.')
  if (args.password.length < 8) throw new Error('Personal password must contain at least 8 characters.')

  const current = await getCloudSession()
  const email = memberAuthEmail(roomLoginId, username)
  if (current?.user?.email && current.user.email !== email) await sb.auth.signOut()
  if (current?.user?.email === email) return current.user

  const signUp = await sb.auth.signUp({
    email,
    password: args.password,
    options: {
      data: {
        display_name: args.displayName,
        room_login_id: roomLoginId,
        login_username: username,
        roomhisaab_member: true,
      },
    },
  })
  if (!signUp.error && signUp.data.user) {
    if (signUp.data.session) return signUp.data.user
    const retry = await sb.auth.signInWithPassword({ email, password: args.password })
    if (retry.error) throw retry.error
    return retry.data.user
  }

  // Retry flow: pichli koshish me account ban gaya tha lekin room claim adhoora reh gaya.
  const signIn = await sb.auth.signInWithPassword({ email, password: args.password })
  if (signIn.error) throw signUp.error ?? signIn.error
  return signIn.data.user
}

export interface CreateCloudRoomInput {
  roomName: string
  roomLoginId: string
  roomPassword: string
  username: string
  personalPassword: string
  creatorName: string
  creatorDetails?: Partial<Member>
  initialMembers: { name: string; details?: Partial<Member> }[]
  rentCycleDay: number
  cycleMode: 'monthly' | 'custom'
  cycleStart?: number
  cycleEnd?: number
}

export async function createCloudRoom(input: CreateCloudRoomInput): Promise<Json> {
  const roomLoginId = normalizeRoomLoginId(input.roomLoginId)
  const username = normalizeLoginUsername(input.username)
  await signUpOrSignInMember({
    roomLoginId,
    username,
    password: input.personalPassword,
    displayName: input.creatorName,
  })
  return rpcOk('create_cloud_room', {
    p_payload: {
      name: input.roomName,
      login_id: roomLoginId,
      room_password: input.roomPassword,
      rent_cycle_day: input.rentCycleDay,
      cycle_mode: input.cycleMode,
      cycle_start: input.cycleStart ? new Date(input.cycleStart).toISOString() : null,
      cycle_end: input.cycleEnd ? new Date(input.cycleEnd).toISOString() : null,
      creator: {
        display_name: input.creatorName,
        login_username: username,
        color_hex: colorFromName(input.creatorName),
        details: cleanDetails(input.creatorDetails),
      },
      initial_members: input.initialMembers.map((m) => ({
        display_name: m.name,
        color_hex: colorFromName(m.name),
        is_virtual: Boolean(m.details?.isVirtual),
        details: cleanDetails(m.details),
      })),
    },
  })
}

export interface MigrateLocalRoomInput {
  state: AppState
  currentMemberId: string
  roomLoginId: string
  roomPassword: string
  username: string
  personalPassword: string
}

export async function migrateLocalRoomToCloud(input: MigrateLocalRoomInput): Promise<Json> {
  const room = input.state.room
  if (!room || room.cloud || room.demo) throw new Error('Only a real local room can be migrated. Sample demo data cannot be migrated.')
  const members = input.state.members
  const current = members.find((m) => m.id === input.currentMemberId)
  if (!current || current.isVirtual) throw new Error('Select your real member account for migration.')
  if (members.length < 1 || members.length > 8) throw new Error('A cloud room can contain at most 8 members.')

  const roomLoginId = normalizeRoomLoginId(input.roomLoginId)
  const username = normalizeLoginUsername(input.username)
  const known = new Set(members.map((m) => m.id))
  const expenses = input.state.expenses.filter((e) => e.roomId === room.id && !e.deleted)
  const settlements = input.state.settlements.filter((s) => s.roomId === room.id)
  const recurring = input.state.recurring.filter((r) => r.roomId === room.id)
  if (expenses.length > 1000 || settlements.length > 1000 || recurring.length > 100) {
    throw new Error('This local room is too large for one migration. Keep the JSON backup safe and migrate it in parts.')
  }
  if (new Set(expenses.map((e) => e.id)).size !== expenses.length) throw new Error('Local expenses contain a duplicate ID. Migration was stopped.')

  for (const e of expenses) {
    if (!known.has(e.payerId)) throw new Error(`"${e.description}": payer is not a current member.`)
    if (!e.splits.length || e.splits.some((s) => !known.has(s.memberId))) throw new Error(`"${e.description}": unknown member in the split.`)
    if (e.splits.reduce((sum, s) => sum + s.paise, 0) !== e.amountPaise) throw new Error(`"${e.description}": split total does not match the amount.`)
  }
  for (const s of settlements) {
    if (!known.has(s.fromId) || !known.has(s.toId) || s.fromId === s.toId) throw new Error('A settlement contains invalid members.')
  }
  for (const r of recurring) {
    if (!known.has(r.payerId)) throw new Error(`Recurring "${r.description}": payer is not a member.`)
  }

  await signUpOrSignInMember({
    roomLoginId,
    username,
    password: input.personalPassword,
    displayName: current.name,
  })

  return rpcOk('migrate_local_room_to_cloud', {
    p_payload: {
      login_username: username,
      room: {
        name: room.name,
        login_id: roomLoginId,
        room_password: input.roomPassword,
        legacy_local_id: room.id,
        rent_cycle_day: room.rentCycleDay,
        cycle_mode: room.cycleMode ?? 'monthly',
        cycle_start: room.cycleStart ? new Date(room.cycleStart).toISOString() : null,
        cycle_end: room.cycleEnd ? new Date(room.cycleEnd).toISOString() : null,
      },
      members: members.map((m) => ({
        local_id: m.id,
        cloud_member_id: newCloudUuid(),
        display_name: m.name,
        color_hex: m.color || colorFromName(m.name),
        is_virtual: Boolean(m.isVirtual),
        is_current: m.id === current.id,
        details: cleanDetails(m),
      })),
      expenses: expenses.map((e) => ({
        local_id: e.id,
        payer_local_id: e.payerId,
        description: e.description,
        category: e.category,
        amount_paise: e.amountPaise,
        method: e.method,
        split_mode: e.splitMode,
        note: e.note ?? null,
        vendor_name: e.vendorName ?? null,
        vendor_upi_id: e.vendorUpiId ?? null,
        instant_pay: Boolean(e.instantPay),
        source: e.source,
        confidence: e.confidence ?? null,
        status: e.status,
        photo_url: e.photoUrl && /^https?:\/\//i.test(e.photoUrl) ? e.photoUrl : null,
        occurred_at_ms: Number.isFinite(e.createdAt) ? e.createdAt : Date.now(),
        updated_at_ms: Number.isFinite(e.updatedAt) ? e.updatedAt : e.createdAt,
        splits: e.splits.map((s) => ({ member_local_id: s.memberId, amount_paise: s.paise })),
        reactions: Object.fromEntries(Object.entries(e.reactions ?? {})
          .filter(([emoji]) => emoji.length >= 1 && emoji.length <= 16)
          .map(([emoji, ids]) => [emoji, [...new Set(ids.filter((id) => known.has(id)))]])
          .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)),
      })),
      settlements: settlements.map((s) => ({
        local_id: s.id,
        from_local_id: s.fromId,
        to_local_id: s.toId,
        amount_paise: s.amountPaise,
        method: s.method,
        note: s.note ?? null,
        created_at_ms: Number.isFinite(s.createdAt) ? s.createdAt : Date.now(),
        confirmed_by_local_ids: [...new Set(s.confirmedBy.filter((id) => known.has(id)))],
      })),
      recurring: recurring.map((r) => ({
        local_id: r.id,
        payer_local_id: r.payerId,
        description: r.description,
        category: r.category,
        amount_paise: r.amountPaise,
        split_mode: r.splitMode,
        day_of_month: r.dayOfMonth,
        method: r.method,
        active: r.active,
        last_run_key: r.lastRunKey ?? null,
      })),
    },
  })
}

export async function loginCloudMember(args: {
  roomLoginId: string
  username: string
  password: string
}): Promise<CloudMembershipSummary> {
  const sb = requireSupabase()
  const roomLoginId = normalizeRoomLoginId(args.roomLoginId)
  const username = normalizeLoginUsername(args.username)
  const email = memberAuthEmail(roomLoginId, username)
  const { data, error } = await sb.auth.signInWithPassword({ email, password: args.password })
  if (error) throw error
  const memberships = await fetchMyMemberships(data.user.id)
  const found = memberships.find((m) => m.roomLoginId === roomLoginId)
  if (!found) {
    await sb.auth.signOut()
    throw new Error('The account was found, but it has no active membership for this Room Login ID.')
  }
  return found
}

export async function previewCloudInvite(token: string): Promise<CloudInvitePreview> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('preview_room_invite', { p_token: token })
  if (error) throw error
  return data as CloudInvitePreview
}

export interface ClaimCloudInviteInput {
  token: string
  roomLoginId: string
  roomPassword: string
  username: string
  personalPassword: string
  memberId?: string
  displayName: string
  details?: Partial<Member>
}

export async function claimCloudInvite(input: ClaimCloudInviteInput): Promise<Json> {
  const sb = requireSupabase()
  const username = normalizeLoginUsername(input.username)
  await signUpOrSignInMember({
    roomLoginId: input.roomLoginId,
    username,
    password: input.personalPassword,
    displayName: input.displayName,
  })
  try {
    return await rpcOk('claim_room_invite', {
      p_token: input.token,
      p_room_password: input.roomPassword,
      p_member_id: input.memberId ?? null,
      p_new_member: {
        display_name: input.displayName,
        color_hex: colorFromName(input.displayName),
        details: cleanDetails(input.details),
      },
      p_login_username: username,
    })
  } catch (error) {
    // Galat room password par aadha-bana session device par mat chhodo.
    await sb.auth.signOut().catch(() => undefined)
    throw error
  }
}

export async function createCloudInvite(roomId: string, targetMemberId?: string): Promise<{ link: string; expiresAt: string; roomLoginId: string }> {
  const result = await rpcOk('create_room_invite', {
    p_room_id: roomId,
    p_target_member_id: targetMemberId ?? null,
    p_expires_days: 7,
    p_max_uses: targetMemberId ? 1 : 8,
  })
  const token = asString(result.token)
  const roomLoginId = asString(result.room_login_id)
  const origin = window.location.origin
  return {
    link: `${origin}/join#invite=${encodeURIComponent(token)}&room=${encodeURIComponent(roomLoginId)}`,
    expiresAt: asString(result.expires_at),
    roomLoginId,
  }
}

export async function cloudAddPlaceholder(roomId: string, name: string, details?: Partial<Member>): Promise<string> {
  const result = await rpcOk('add_room_member_placeholder', {
    p_room_id: roomId,
    p_display_name: name,
    p_details: cleanDetails(details),
    p_is_virtual: Boolean(details?.isVirtual),
    p_color_hex: details?.color ?? colorFromName(name),
  })
  return asString(result.member_id)
}

export async function cloudUpdateMyProfile(roomId: string, member: Member): Promise<void> {
  await rpcOk('update_my_member_profile', {
    p_room_id: roomId,
    p_display_name: member.name,
    p_color_hex: member.color,
    p_details: cleanDetails(member),
  })
}

export async function cloudUpdatePlaceholder(member: Member): Promise<void> {
  await rpcOk('update_placeholder_member', {
    p_member_id: member.id,
    p_display_name: member.name,
    p_color_hex: member.color,
    p_details: cleanDetails(member),
    p_is_virtual: Boolean(member.isVirtual),
  })
}

export async function cloudUpdateRoomSettings(room: NonNullable<AppState['room']>): Promise<void> {
  await rpcOk('update_room_settings', {
    p_room_id: room.id,
    p_patch: {
      name: room.name,
      rent_cycle_day: room.rentCycleDay,
      cycle_mode: room.cycleMode ?? 'monthly',
      cycle_start: room.cycleStart ? new Date(room.cycleStart).toISOString() : null,
      cycle_end: room.cycleEnd ? new Date(room.cycleEnd).toISOString() : null,
    },
  })
}

export async function cloudPushExpense(expense: Expense): Promise<void> {
  const cloudPhoto = expense.photoUrl && /^https?:\/\//i.test(expense.photoUrl) ? expense.photoUrl : null
  await rpcOk('upsert_expense_with_splits', {
    p_payload: {
      id: expense.id,
      room_id: expense.roomId,
      payer_member_id: expense.payerId,
      description: expense.description,
      category: expense.category,
      amount_paise: expense.amountPaise,
      method: expense.method,
      split_mode: expense.splitMode,
      note: expense.note ?? null,
      vendor_name: expense.vendorName ?? null,
      vendor_upi_id: expense.vendorUpiId ?? null,
      instant_pay: Boolean(expense.instantPay),
      source: expense.source,
      confidence: expense.confidence ?? null,
      status: expense.status,
      photo_url: cloudPhoto,
      occurred_at_ms: expense.createdAt,
      deleted: Boolean(expense.deleted),
      splits: expense.splits.map((s) => ({ member_id: s.memberId, amount_paise: s.paise })),
    },
  })
}

export async function cloudPushReaction(roomId: string, expenseId: string, memberId: string, emoji: string, active: boolean): Promise<void> {
  const sb = requireSupabase()
  if (active) {
    const { error } = await sb.from('expense_reactions').insert({ room_id: roomId, expense_id: expenseId, member_id: memberId, emoji })
    if (error) throw error
  } else {
    const { error } = await sb.from('expense_reactions').delete().eq('expense_id', expenseId).eq('member_id', memberId).eq('emoji', emoji)
    if (error) throw error
  }
}

export async function cloudPushSettlement(settlement: Settlement, currentMemberId: string): Promise<void> {
  const sb = requireSupabase()
  const user = await getCloudUser()
  if (!user) throw new Error('Sign-in required.')
  const { error } = await sb.from('settlements').insert({
    id: settlement.id,
    room_id: settlement.roomId,
    created_by_user_id: user.id,
    from_member_id: settlement.fromId,
    to_member_id: settlement.toId,
    amount_paise: settlement.amountPaise,
    method: settlement.method,
    note: settlement.note ?? null,
    created_at: new Date(settlement.createdAt).toISOString(),
  })
  if (error) throw error
  if (settlement.confirmedBy.includes(currentMemberId)) {
    const { error: confirmError } = await sb.from('settlement_confirmations').insert({
      settlement_id: settlement.id,
      room_id: settlement.roomId,
      member_id: currentMemberId,
    })
    if (confirmError) throw confirmError
  }
}

export async function cloudConfirmSettlement(roomId: string, settlementId: string, memberId: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('settlement_confirmations').upsert(
    { settlement_id: settlementId, room_id: roomId, member_id: memberId },
    { onConflict: 'settlement_id,member_id' },
  )
  if (error) throw error
}

export async function cloudPushRecurring(recurring: Recurring): Promise<void> {
  const sb = requireSupabase()
  const user = await getCloudUser()
  if (!user) throw new Error('Sign-in required.')
  const { error } = await sb.from('recurring_expenses').upsert({
    id: recurring.id,
    room_id: recurring.roomId,
    created_by_user_id: user.id,
    payer_member_id: recurring.payerId,
    description: recurring.description,
    category: recurring.category,
    amount_paise: recurring.amountPaise,
    split_mode: recurring.splitMode,
    day_of_month: recurring.dayOfMonth,
    method: recurring.method,
    active: recurring.active,
    last_run_key: recurring.lastRunKey ?? null,
  }, { onConflict: 'id' })
  if (error) throw error
}

export async function cloudDeleteRecurring(id: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('recurring_expenses').delete().eq('id', id)
  if (error) throw error
}

export async function cloudResetMemberLogin(memberId: string): Promise<void> {
  await rpcOk('reset_member_login', { p_member_id: memberId })
}

export interface RecoveryKeyStatus {
  hasKey: boolean
  keyHint?: string
  createdAt?: string
  lockedUntil?: string
}

export async function replaceMyRecoveryKey(roomId: string, recoveryKey: string): Promise<Json> {
  const keyHash = await hashRecoveryKey(recoveryKey)
  const clean = recoveryKey.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return rpcOk('replace_my_recovery_key', {
    p_room_id: roomId,
    p_key_hash: keyHash,
    p_key_hint: clean.slice(-4),
  })
}

export async function fetchMyRecoveryKeyStatus(roomId: string): Promise<RecoveryKeyStatus> {
  const result = await rpcOk('my_recovery_key_status', { p_room_id: roomId })
  return {
    hasKey: Boolean(result.has_key),
    keyHint: asString(result.key_hint) || undefined,
    createdAt: asString(result.created_at) || undefined,
    lockedUntil: asString(result.locked_until) || undefined,
  }
}

export interface RecoverCloudMemberInput {
  roomLoginId: string
  oldUsername: string
  newUsername: string
  roomPassword: string
  recoveryKey: string
  newPersonalPassword: string
}

export async function recoverCloudMemberWithKey(input: RecoverCloudMemberInput): Promise<Json> {
  const sb = requireSupabase()
  const roomLoginId = normalizeRoomLoginId(input.roomLoginId)
  const oldUsername = normalizeLoginUsername(input.oldUsername)
  const newUsername = normalizeLoginUsername(input.newUsername)
  if (!roomLoginId || !oldUsername || !newUsername) throw new Error('Recovery details are invalid.')
  if (oldUsername === newUsername) throw new Error('Choose a new login username for the recovered account.')

  const keyHash = await hashRecoveryKey(input.recoveryKey)
  await signUpOrSignInMember({
    roomLoginId,
    username: newUsername,
    password: input.newPersonalPassword,
    displayName: oldUsername,
  })

  try {
    return await rpcOk('recover_member_with_recovery_key', {
      p_room_login_id: roomLoginId,
      p_old_username: oldUsername,
      p_new_username: newUsername,
      p_room_password: input.roomPassword,
      p_key_hash: keyHash,
    })
  } catch (error) {
    await sb.auth.signOut().catch(() => undefined)
    throw error
  }
}

export async function cloudTouchMembership(roomId: string): Promise<void> {
  await rpcOk('touch_my_membership', { p_room_id: roomId })
}

export async function cloudSignOut(): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.auth.signOut()
  if (error) throw error
}

export function parseCloudInviteLocation(search: string, hash: string): { token: string; roomLoginId: string } {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  return {
    token: fragment.get('invite') ?? fragment.get('token') ?? query.get('invite') ?? query.get('token') ?? '',
    roomLoginId: normalizeRoomLoginId(fragment.get('room') ?? query.get('room') ?? ''),
  }
}

export { cloudErrorMessage }
