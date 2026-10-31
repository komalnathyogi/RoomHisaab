// ─────────────────────────────────────────────────────────────
// CENTRAL STORE — local-first, optimistic, undo-able
// Har action turant UI pe reflect hota hai (optimistic) aur localStorage me save.
// Module 3 me yahi functions Supabase call karenge — UI code change nahi hoga.
// ─────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppState, Expense, InboxItem, Member, ParsedTransaction, Recurring, Rule, Settlement } from '../lib/types'
import { emptyState, loadState, saveState, flushPendingStateSave, clearDemoState, wipeAllData, importJSON } from '../lib/storage'
import { makeSeedRoom, type DemoSeedOptions } from '../lib/seed'
import { uid, roomCode } from '../lib/id'
import { colorFromName } from '../lib/constants'
import { parseBankSMS, dedupeKey, detectMerchant } from '../lib/smsParser'
import { splitEqual } from '../lib/money'
import { mergeRoomSyncPacket, type RoomSyncPacket } from '../lib/share'
import { isCloudConfigured, supabase, cloudErrorMessage } from '../lib/supabase'
import {
  clearCloudMeta,
  cloudAddPlaceholder,
  cloudConfirmSettlement,
  cloudDeleteRecurring,
  cloudPushExpense,
  cloudPushReaction,
  cloudPushRecurring,
  cloudPushSettlement,
  cloudSignOut,
  cloudTouchMembership,
  cloudUpdateMyProfile,
  cloudUpdatePlaceholder,
  cloudUpdateRoomSettings,
  createCloudInvite,
  createCloudRoom,
  claimCloudInvite,
  fetchCloudRoomSnapshot,
  fetchMyMemberships,
  getCloudSession,
  loadCloudMeta,
  loginCloudMember,
  migrateLocalRoomToCloud,
  recoverCloudMemberWithKey,
  saveCloudMeta,
  type CloudMembershipSummary,
  type CloudMeta,
  type CreateCloudRoomInput,
  type ClaimCloudInviteInput,
  type RecoverCloudMemberInput,
} from '../lib/cloud'
import { setRememberDevicePreference } from '../lib/authPersistence'
import { stableExpenses, stableMembers } from '../lib/members'
import { loadDeletedExpenses, saveDeletedExpenses, DELETED_EXPENSE_TTL_MS, type DeletedExpenseRecord } from '../lib/trash'

// ── Toast (5-second undo ke saath) ─────────────────────────
export interface Toast {
  id: string
  message: string
  tone?: 'ok' | 'warn' | 'bad'
  actionLabel?: string
  onAction?: () => void
}

export interface CloudState {
  configured: boolean
  status: 'local' | 'checking' | 'connected' | 'syncing' | 'error'
  userId?: string
  roomId?: string
  memberId?: string
  roomLoginId?: string
  username?: string
  role?: 'owner' | 'admin' | 'member'
  availableRooms: CloudMembershipSummary[]
  lastSyncedAt?: number
  error?: string
}

export interface CloudMigrateLocalRoomInput {
  roomLoginId: string
  roomPassword: string
  username: string
  personalPassword: string
  currentMemberId?: string
}

interface Ctx {
  state: AppState
  ready: boolean
  cloud: CloudState
  cloudLogin: (roomLoginId: string, username: string, password: string, replaceLocalRoom?: boolean, rememberDevice?: boolean) => Promise<{ ok: boolean; error?: string }>
  cloudLogout: () => Promise<void>
  cloudRefresh: () => Promise<boolean>
  cloudOpenRoom: (roomId: string, replaceLocalRoom?: boolean) => Promise<{ ok: boolean; error?: string }>
  cloudCreateRoom: (input: CreateCloudRoomInput) => Promise<{ ok: boolean; error?: string }>
  cloudMigrateLocalRoom: (input: CloudMigrateLocalRoomInput) => Promise<{ ok: boolean; error?: string }>
  cloudClaimInvite: (input: ClaimCloudInviteInput, replaceLocalRoom?: boolean) => Promise<{ ok: boolean; error?: string }>
  cloudRecoverWithKey: (input: RecoverCloudMemberInput, replaceLocalRoom?: boolean) => Promise<{ ok: boolean; error?: string }>
  createCloudInviteLink: (targetMemberId?: string) => Promise<{ link: string; expiresAt: string; roomLoginId: string } | null>
  isCloudRoomActive: boolean
  canEditExpense: (expense: Expense, currentMemberId?: string) => boolean
  canEditMember: (member: Member, currentMemberId?: string) => boolean
  toasts: Toast[]
  deletedExpenses: DeletedExpenseRecord[]
  restoreDeletedExpense: (id: string) => void
  pushToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  // room & members
  createRoom: (name: string, myName: string, rentCycleDay: number, myDetails?: Partial<Member>, initialMembers?: { name: string; details?: Partial<Member> }[], cyclePatch?: Partial<NonNullable<AppState['room']>>) => void
  loadDemo: (options?: DemoSeedOptions & { names?: string[] }) => Promise<boolean>
  resetDemo: () => Promise<boolean>
  exitDemo: () => Promise<void>
  addMember: (name: string, details?: Partial<Member>) => Member | null
  updateMember: (id: string, patch: Partial<Member>) => void
  removeMember: (id: string) => void
  updateRoom: (patch: Partial<NonNullable<AppState['room']>>) => void
  setCurrentMember: (memberId: string) => boolean
  applyRoomSyncPacket: (packet: RoomSyncPacket, selection?: JoinSelection) => { ok: boolean; memberId?: string; error?: string }
  // expenses
  addExpense: (draft: NewExpense) => Expense
  updateExpense: (id: string, patch: Partial<Expense>) => void
  deleteExpense: (id: string) => void   // undo ke saath
  reactExpense: (id: string, emoji: string, memberId: string) => void
  // settlements
  settle: (fromId: string, toId: string, amountPaise: number, method: Settlement['method'], confirmedBy: string[]) => void
  confirmSettlement: (id: string, memberId: string) => void
  // inbox / automation
  ingestSMS: (raw: string) => { item: InboxItem | null; error?: string }
  ingestParsedBatch: (items: { parsed: ParsedTransaction; rawText: string; source?: InboxItem['source'] }[]) => { added: number; duplicates: number }
  acceptInboxItem: (id: string, patch?: Partial<Expense>) => void
  ignoreInboxItem: (id: string) => void
  acceptAllHighConfidence: (threshold?: number) => number
  // recurring + rules
  upsertRecurring: (r: Recurring) => void
  toggleRecurring: (id: string) => void
  deleteRecurring: (id: string) => void
  runDueRecurring: () => number
  upsertRule: (r: Rule) => void
  toggleRule: (id: string) => void
  deleteRule: (id: string) => void
  // profile / data
  updateProfile: (patch: Partial<AppState['profile']>) => void
  resetAll: () => void
  wipeData: () => void
  importState: (json: string) => boolean
}

export interface NewExpense {
  description: string
  amountPaise: number
  category: Expense['category']
  payerId: string
  method: Expense['method']
  splitMode: Expense['splitMode']
  splits: { memberId: string; paise: number }[]
  photoUrl?: string
  note?: string
  vendorName?: string
  vendorUpiId?: string
  instantPay?: boolean
  source?: Expense['source']
  confidence?: number
  rawText?: string
  createdAt?: number
  status?: Expense['status']
}

export interface JoinSelection {
  memberId?: string
  newMemberName?: string
  newMemberDetails?: Partial<Member>
  replaceDifferentRoom?: boolean
}


/**
 * ⭐ AUTO-BRAIN: Inbox confirm pe category/split khud decide karo.
 * Order: 1) active Rule  2) Merchant memory  3) parser ki suggested category.
 * split 'subset' ka matlab yahan "personal" (sirf dene wala) rakha gaya hai,
 * kyunki auto-confirm me users se list nahi poochhi ja sakti.
 */
function resolveAuto(s: AppState, p: ParsedTransaction): {
  category: Expense['category']; splitMode: Expense['splitMode']; sharerIds: string[]
} {
  const rule = s.rules.find((r) => {
    if (!r.active) return false
    const needle = (r.when.merchantContains ?? '').toUpperCase()
    const merchantMatch = !needle || p.merchantKey.includes(needle) || p.merchant.toUpperCase().includes(needle)
    const amountOk = !r.when.amountBelowPaise || p.amountPaise < r.when.amountBelowPaise
    const catOk = !r.when.category || r.when.category === p.suggestedCategory
    return merchantMatch && amountOk && catOk
  })
  const memory = s.merchants.find((m) => m.key === p.merchantKey)
  const payerId = s.members[0]?.id
  const splitMode = (rule?.then.splitMode ?? memory?.defaultSplitMode ?? 'equal') as Expense['splitMode']
  const nonVirtual = s.members.filter((m) => !m.isVirtual).map((m) => m.id)
  const sharerIds = splitMode === 'subset'
    ? (rule?.then.personalOf ? [rule.then.personalOf] : payerId ? [payerId] : nonVirtual)
    : nonVirtual
  return {
    category: (rule?.then.category ?? memory?.defaultCategory ?? p.suggestedCategory ?? detectMerchant(p.merchant)?.category ?? 'other') as Expense['category'],
    splitMode,
    sharerIds: sharerIds.length ? sharerIds : nonVirtual,
  }
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => emptyState())
  const [ready, setReady] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [deletedExpenses, setDeletedExpenses] = useState<DeletedExpenseRecord[]>(() => loadDeletedExpenses())
  const [cloud, setCloud] = useState<CloudState>({
    configured: isCloudConfigured,
    status: isCloudConfigured ? 'checking' : 'local',
    availableRooms: [],
  })
  const timers = useRef<Record<string, number>>({})
  const stateRef = useRef(state)
  const cloudRef = useRef(cloud)
  const cloudMetaRef = useRef<CloudMeta | null>(isCloudConfigured ? loadCloudMeta() : null)
  const cloudInitRef = useRef(false)
  const cloudRefreshTimer = useRef<number | undefined>(undefined)
  const cloudRefreshInFlightRef = useRef(false)
  const cloudRefreshQueuedRef = useRef(false)
  const cloudRefreshRef = useRef<(() => Promise<boolean>) | null>(null)
  const cloudSyncSeqRef = useRef(0)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { cloudRef.current = cloud }, [cloud])

  // load on mount
  useEffect(() => {
    setState(loadState())
    setReady(true)
  }, [])

  // persist on change
  useEffect(() => { if (ready) saveState(state) }, [state, ready])
  useEffect(() => { saveDeletedExpenses(deletedExpenses) }, [deletedExpenses])

  // cleanup toast timers
  useEffect(() => () => { Object.values(timers.current).forEach((t) => window.clearTimeout(t)) }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    window.clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid('t_')
    setToasts((prev) => [...prev.slice(-2), { ...t, id }])
    timers.current[id] = window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
      delete timers.current[id]
    }, 5000)
  }, [])

  // ── CLOUD SESSION / SYNC ──────────────────────────────────
  const setCloudFromMeta = useCallback((meta: CloudMeta, rooms: CloudMembershipSummary[] = cloudRef.current.availableRooms) => {
    cloudMetaRef.current = meta
    saveCloudMeta(meta)
    setCloud({
      configured: true,
      status: 'connected',
      userId: meta.userId,
      roomId: meta.roomId,
      memberId: meta.memberId,
      roomLoginId: meta.roomLoginId,
      username: meta.username,
      role: meta.role,
      availableRooms: rooms,
      lastSyncedAt: Date.now(),
    })
  }, [])

  const cloudActiveMeta = useCallback((): CloudMeta | null => {
    const meta = cloudMetaRef.current
    if (!meta || stateRef.current.room?.id !== meta.roomId || !stateRef.current.room?.cloud) return null
    return meta
  }, [])

  const touchCloudMembershipThrottled = useCallback((meta: CloudMeta) => {
    const key = `roomhisaab.cloudTouch.${meta.roomId}.${meta.userId}`
    const now = Date.now()
    try {
      const last = Number(window.localStorage.getItem(key) ?? 0)
      if (now - last < 30 * 60 * 1000) return
      window.localStorage.setItem(key, String(now))
    } catch {
      // If storage is unavailable, still avoid making activity updates a blocker.
    }
    void cloudTouchMembership(meta.roomId).catch(() => {
      try { window.localStorage.removeItem(key) } catch { /* ignore */ }
    })
  }, [])

  const openCloudSnapshot = useCallback(async (
    roomId: string,
    replaceLocalRoom = false,
    silent = false,
  ): Promise<{ ok: boolean; error?: string; meta?: CloudMeta }> => {
    if (!isCloudConfigured) return { ok: false, error: 'Supabase is not configured.' }
    const local = stateRef.current
    if (local.room && local.room.id !== roomId && !replaceLocalRoom) {
      return { ok: false, error: 'Another local room is open on this device. Export a backup first, then confirm opening the cloud room.' }
    }
    const background = silent && cloudRef.current.status === 'connected' && cloudRef.current.roomId === roomId
    let slowTimer: number | undefined
    if (!background) {
      setCloud((c) => ({ ...c, status: 'syncing', error: undefined }))
    } else {
      // Do not flash "Syncing" for a fast background refresh. Show it only
      // when the request is genuinely slow.
      slowTimer = window.setTimeout(() => {
        setCloud((c) => (c.roomId === roomId ? { ...c, status: 'syncing', error: undefined } : c))
      }, 2500)
    }
    try {
      const existingRooms = cloudRef.current.availableRooms
      const [snapshot, rooms] = await Promise.all([
        fetchCloudRoomSnapshot(roomId, local),
        silent && existingRooms.length ? Promise.resolve(existingRooms) : fetchMyMemberships(),
      ])
      const normalizedState: AppState = {
        ...snapshot.state,
        room: snapshot.state.room ? { ...snapshot.state.room, mode: snapshot.state.members.filter((member) => !member.isVirtual).length > 1 ? 'shared' : 'personal' } : null,
      }
      const unchanged = silent && JSON.stringify(normalizedState) === JSON.stringify(local)
      if (!unchanged) setState(normalizedState)
      setCloudFromMeta(snapshot.meta, rooms)
      touchCloudMembershipThrottled(snapshot.meta)
      if (!silent) pushToast({ message: `${snapshot.state.room?.name ?? 'Cloud room'} synced.`, tone: 'ok' })
      return { ok: true, meta: snapshot.meta }
    } catch (error) {
      const message = cloudErrorMessage(error)
      setCloud((c) => ({ ...c, status: 'error', error: message }))
      if (!silent) pushToast({ message, tone: 'bad' })
      return { ok: false, error: message }
    } finally {
      window.clearTimeout(slowTimer)
    }
  }, [pushToast, setCloudFromMeta, touchCloudMembershipThrottled])

  const cloudRefresh = useCallback(async (): Promise<boolean> => {
    const meta = cloudMetaRef.current
    if (!meta) return false
    if (cloudRefreshInFlightRef.current) {
      cloudRefreshQueuedRef.current = true
      return true
    }
    cloudRefreshInFlightRef.current = true
    try {
      const result = await openCloudSnapshot(meta.roomId, stateRef.current.room?.id === meta.roomId, true)
      return result.ok
    } finally {
      cloudRefreshInFlightRef.current = false
      if (cloudRefreshQueuedRef.current) {
        cloudRefreshQueuedRef.current = false
        window.clearTimeout(cloudRefreshTimer.current)
        cloudRefreshTimer.current = window.setTimeout(() => { void cloudRefreshRef.current?.() }, 1500)
      }
    }
  }, [openCloudSnapshot])

  useEffect(() => { cloudRefreshRef.current = cloudRefresh }, [cloudRefresh])

  const scheduleCloudRefresh = useCallback(() => {
    if (!cloudMetaRef.current) return
    window.clearTimeout(cloudRefreshTimer.current)
    // One calm, coalesced refresh is enough for a burst of realtime events.
    cloudRefreshTimer.current = window.setTimeout(() => { void cloudRefresh() }, 2000)
  }, [cloudRefresh])

  const runCloudSync = useCallback((task: () => Promise<void>, failure = 'Cloud sync failed. Reloading the latest data') => {
    if (!cloudActiveMeta()) return
    const seq = ++cloudSyncSeqRef.current
    const wasConnected = cloudRef.current.status === 'connected'
    let slowTimer: number | undefined
    if (wasConnected) {
      slowTimer = window.setTimeout(() => {
        if (cloudSyncSeqRef.current === seq) setCloud((c) => ({ ...c, status: 'syncing', error: undefined }))
      }, 1800)
    } else {
      setCloud((c) => ({ ...c, status: 'syncing', error: undefined }))
    }
    void task()
      .then(() => {
        window.clearTimeout(slowTimer)
        if (cloudSyncSeqRef.current === seq) {
          setCloud((c) => ({ ...c, status: 'connected', lastSyncedAt: Date.now(), error: undefined }))
        }
      })
      .catch((error) => {
        window.clearTimeout(slowTimer)
        const message = cloudErrorMessage(error)
        if (cloudSyncSeqRef.current === seq) {
          setCloud((c) => ({ ...c, status: 'error', error: message }))
        }
        pushToast({ message: `${failure}: ${message}`, tone: 'bad' })
        void cloudRefresh()
      })
  }, [cloudActiveMeta, cloudRefresh, pushToast])

  useEffect(() => {
    if (!ready || !isCloudConfigured || cloudInitRef.current) return
    cloudInitRef.current = true
    let alive = true
    ;(async () => {
      try {
        const session = await getCloudSession()
        if (!alive) return
        if (!session?.user) {
          cloudMetaRef.current = null
          setCloud({ configured: true, status: 'local', availableRooms: [] })
          return
        }
        const rooms = await fetchMyMemberships(session.user.id)
        if (!alive) return
        const saved = cloudMetaRef.current
        const selected = rooms.find((r) => r.roomId === saved?.roomId) ?? rooms[0]
        setCloud((c) => ({ ...c, status: 'connected', userId: session.user.id, availableRooms: rooms }))
        if (!selected) return
        const localRoom = stateRef.current.room
        if (!localRoom || (!localRoom.demo && localRoom.id === selected.roomId)) {
          await openCloudSnapshot(selected.roomId, true, true)
        } else if (saved?.userId === session.user.id) {
          // Local room ko bina bole overwrite nahi karenge.
          cloudMetaRef.current = {
            roomId: selected.roomId,
            memberId: selected.memberId,
            roomLoginId: selected.roomLoginId,
            username: selected.username,
            userId: session.user.id,
            role: selected.role,
          }
        }
      } catch (error) {
        if (alive) setCloud((c) => ({ ...c, status: 'error', error: cloudErrorMessage(error), availableRooms: [] }))
      }
    })()
    return () => { alive = false }
  }, [ready, openCloudSnapshot])

  useEffect(() => {
    if (!supabase || !cloud.roomId || cloud.status === 'local') return
    const roomId = cloud.roomId
    if (state.room?.id !== roomId) return
    const client = supabase
    const channel = client.channel(`roomhisaab-room-${roomId}`)
    const tables = ['rooms', 'room_members', 'expenses', 'expense_splits', 'expense_reactions', 'settlements', 'settlement_confirmations', 'recurring_expenses'] as const
    for (const table of tables) {
      const filter = table === 'rooms' ? `id=eq.${roomId}` : `room_id=eq.${roomId}`
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, scheduleCloudRefresh)
    }
    channel.subscribe()
    return () => { void client.removeChannel(channel) }
  }, [cloud.roomId, state.room?.id, scheduleCloudRefresh])

  const cloudLogin = useCallback(async (
    roomLoginId: string,
    username: string,
    password: string,
    replaceLocalRoom = false,
    rememberDevice = true,
  ) => {
    try {
      const membership = await loginCloudMember({ roomLoginId, username, password })
      // Sign-in safal hone ke baad hi remember preference apply karo:
      // galat password par purana valid session kharab nahi hoga.
      setRememberDevicePreference(rememberDevice)
      const result = await openCloudSnapshot(membership.roomId, replaceLocalRoom)
      if (!result.ok) return result
      return { ok: true }
    } catch (error) {
      return { ok: false, error: cloudErrorMessage(error) }
    }
  }, [openCloudSnapshot])

  const cloudOpenRoom = useCallback(async (roomId: string, replaceLocalRoom = false) => {
    const result = await openCloudSnapshot(roomId, replaceLocalRoom)
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }, [openCloudSnapshot])

  const cloudLogout = useCallback(async () => {
    const wasCloudRoom = Boolean(stateRef.current.room?.cloud)
    try { await cloudSignOut() } catch { /* local session cleanup neeche hoga */ }
    cloudMetaRef.current = null
    clearCloudMeta()
    setCloud({ configured: isCloudConfigured, status: 'local', availableRooms: [] })
    if (wasCloudRoom) {
      setState((s) => ({ ...emptyState(), profile: { ...emptyState().profile, theme: s.profile.theme, language: s.profile.language, reduceMotion: s.profile.reduceMotion } }))
    }
    pushToast({ message: 'Signed out. The cloud snapshot was removed from this device.', tone: 'ok' })
  }, [pushToast])

  const cloudCreateRoom = useCallback(async (input: CreateCloudRoomInput) => {
    try {
      const result = await createCloudRoom(input)
      const roomId = String(result.room_id ?? '')
      if (!roomId) throw new Error('The room was created, but its cloud ID was not returned.')
      const opened = await openCloudSnapshot(roomId, true)
      return opened.ok ? { ok: true } : { ok: false, error: opened.error }
    } catch (error) {
      return { ok: false, error: cloudErrorMessage(error) }
    }
  }, [openCloudSnapshot])

  const cloudMigrateLocalRoom = useCallback(async (input: CloudMigrateLocalRoomInput) => {
    const local = stateRef.current
    if (!local.room || local.room.cloud) return { ok: false, error: 'Open a local room before migration.' }
    if (local.room.demo) return { ok: false, error: 'Sample demo data cannot be turned into a real cloud room. Create a new room instead.' }
    const current = local.members.find((m) => m.id === (input.currentMemberId ?? local.profile.memberId))
      ?? local.members.find((m) => m.name === local.profile.name && !m.isVirtual)
      ?? local.members.find((m) => !m.isVirtual)
    if (!current) return { ok: false, error: 'The migrating member was not found.' }
    try {
      const result = await migrateLocalRoomToCloud({
        state: local,
        currentMemberId: current.id,
        roomLoginId: input.roomLoginId,
        roomPassword: input.roomPassword,
        username: input.username,
        personalPassword: input.personalPassword,
      })
      const roomId = String(result.room_id ?? '')
      if (!roomId) throw new Error('The room was migrated, but its cloud ID was not returned.')
      const opened = await openCloudSnapshot(roomId, true)
      return opened.ok ? { ok: true } : { ok: false, error: opened.error }
    } catch (error) {
      return { ok: false, error: cloudErrorMessage(error) }
    }
  }, [openCloudSnapshot])

  const cloudClaimInvite = useCallback(async (input: ClaimCloudInviteInput, replaceLocalRoom = false) => {
    try {
      const result = await claimCloudInvite(input)
      const roomId = String(result.room_id ?? '')
      if (!roomId) throw new Error('Join completed, but the room ID was not returned.')
      const opened = await openCloudSnapshot(roomId, replaceLocalRoom || stateRef.current.room?.demo === true)
      return opened.ok ? { ok: true } : { ok: false, error: opened.error }
    } catch (error) {
      return { ok: false, error: cloudErrorMessage(error) }
    }
  }, [openCloudSnapshot])

  const cloudRecoverWithKey = useCallback(async (input: RecoverCloudMemberInput, replaceLocalRoom = false) => {
    try {
      const result = await recoverCloudMemberWithKey(input)
      const roomId = String(result.room_id ?? '')
      if (!roomId) throw new Error('Recovery completed, but the room ID was not returned.')
      const opened = await openCloudSnapshot(roomId, replaceLocalRoom || stateRef.current.room?.demo === true)
      return opened.ok ? { ok: true } : { ok: false, error: opened.error }
    } catch (error) {
      return { ok: false, error: cloudErrorMessage(error) }
    }
  }, [openCloudSnapshot])

  const createCloudInviteLink = useCallback(async (targetMemberId?: string) => {
    const meta = cloudActiveMeta()
    if (!meta) {
      pushToast({ message: 'Sign in to a cloud room first.', tone: 'bad' })
      return null
    }
    try {
      return await createCloudInvite(meta.roomId, targetMemberId)
    } catch (error) {
      pushToast({ message: cloudErrorMessage(error), tone: 'bad' })
      return null
    }
  }, [cloudActiveMeta, pushToast])

  const canEditExpense = useCallback((expense: Expense, currentMemberId?: string): boolean => {
    if (!stateRef.current.room?.cloud) return true
    const meta = cloudMetaRef.current
    return Boolean(meta && expense.payerId === meta.memberId && expense.payerId === (currentMemberId ?? meta.memberId))
  }, [])

  const canEditMember = useCallback((member: Member, currentMemberId?: string): boolean => {
    if (!stateRef.current.room?.cloud) return true
    const meta = cloudMetaRef.current
    if (!meta) return false
    if (member.id === meta.memberId && member.id === (currentMemberId ?? meta.memberId)) return true
    return !member.userId && (meta.role === 'owner' || meta.role === 'admin')
  }, [])

  // ── ROOM & MEMBERS ────────────────────────────────────────
  const createRoom = useCallback((name: string, myName: string, rentCycleDay: number, myDetails?: Partial<Member>, initialMembers: { name: string; details?: Partial<Member> }[] = [], cyclePatch?: Partial<NonNullable<AppState['room']>>) => {
    const cleanDetails = (details?: Partial<Member>): Partial<Member> => ({
      fullName: details?.fullName?.trim() || undefined,
      upiId: details?.upiId?.trim().toLowerCase() || undefined,
      phone: details?.phone?.trim() || undefined,
      email: details?.email?.trim().toLowerCase() || undefined,
      preferredUpiApp: details?.preferredUpiApp ?? 'any',
      quickOpenUpi: details?.quickOpenUpi ?? false,
      defaultSharePercent: details?.defaultSharePercent,
      monthlyBudgetPaise: details?.monthlyBudgetPaise,
      city: details?.city?.trim() || undefined,
      notes: details?.notes?.trim() || undefined,
      isVirtual: details?.isVirtual ?? false,
    })
    const me: Member = {
      id: uid('m_'),
      name: myName.trim() || 'Me',
      color: colorFromName(myName),
      joinedAt: Date.now(),
      role: 'admin',
      joinedVia: 'creator',
      lastActiveAt: Date.now(),
      ...cleanDetails(myDetails),
    }
    const seen = new Set([me.name.toLowerCase()])
    const mates: Member[] = []
    for (const item of initialMembers) {
      const clean = item.name.trim()
      if (!clean || seen.has(clean.toLowerCase()) || mates.length >= 7) continue
      seen.add(clean.toLowerCase())
      mates.push({ id: uid('m_'), name: clean, color: colorFromName(clean), joinedAt: Date.now(), role: 'member', joinedVia: 'manual', ...cleanDetails(item.details) })
    }
    const code = roomCode()
    setState((s) => ({
      ...s,
      room: {
        id: uid('r_'), name: name.trim() || `${me.name}'s Room`, code,
        rentCycleDay: Math.min(Math.max(rentCycleDay || 1, 1), 28),
        mode: initialMembers.filter((m) => !m.details?.isVirtual && m.name.trim()).length + 1 > 1 ? 'shared' : 'personal',
        cycleMode: cyclePatch?.cycleMode ?? 'monthly',
        cycleStart: cyclePatch?.cycleStart,
        cycleEnd: cyclePatch?.cycleEnd,
        createdAt: Date.now(), updatedAt: Date.now(),
      },
      members: [me, ...mates],
      expenses: [], settlements: [], inbox: [], recurring: [], rules: [],
      profile: { ...s.profile, memberId: me.id, name: me.name, onboarded: true },
    }))
    pushToast({ message: `Room created. Invite code: ${code}`, tone: 'ok' })
  }, [pushToast])

  const loadDemo = useCallback(async (options: DemoSeedOptions & { names?: string[] } = {}) => {
    const openRoom = stateRef.current.room
    if (openRoom && !openRoom.demo && !window.confirm('Open a sample demo? Your current room will stay saved and return when you exit the demo.')) return false
    // Flush the real room before switching to the demo's separate storage key.
    flushPendingStateSave()
    const names = options.names
    const seedOptions = { ...options, seed: options.seed }
    setState((current) => {
      const seed = makeSeedRoom(names, seedOptions)
      return {
        ...seed,
        profile: {
          ...seed.profile,
          memberId: seed.members[0]?.id,
          theme: current.profile.theme,
          language: current.profile.language,
          reduceMotion: current.profile.reduceMotion,
        },
      }
    })
    pushToast({ message: 'Demo opened with sample data. No real payment can be sent from Demo Mode.', tone: 'ok' })
    return true
  }, [pushToast])

  const resetDemo = useCallback(async () => {
    const current = stateRef.current
    if (!current.room?.demo) return false
    return loadDemo({
      mode: current.room.mode ?? (current.members.filter((member) => !member.isVirtual).length > 1 ? 'shared' : 'personal'),
      roomName: current.room.name,
      memberCount: current.members.filter((member) => !member.isVirtual).length,
      names: current.members.filter((member) => !member.isVirtual).map((member) => member.name),
      sampleExpenses: current.room.demoSampleExpenses ?? true,
      seed: current.room.demoSeed,
    })
  }, [loadDemo])

  const exitDemo = useCallback(async () => {
    clearDemoState()
    setState(loadState())
    pushToast({ message: 'Demo closed. Your saved room is back.', tone: 'ok' })
  }, [pushToast])

  const addMember = useCallback((name: string, details?: Partial<Member>): Member | null => {
    const clean = name.trim()
    if (!clean) return null
    const current = stateRef.current
    if (current.members.length >= 8) return null
    if (current.members.some((m) => m.name.toLowerCase() === clean.toLowerCase())) return null
    const meta = cloudActiveMeta()
    if (current.room?.cloud && (!meta || (meta.role !== 'owner' && meta.role !== 'admin'))) {
      pushToast({ message: 'Only a cloud room admin or owner can add a placeholder member.', tone: 'bad' })
      return null
    }
    const member: Member = {
      id: uid('m_'),
      name: clean,
      fullName: details?.fullName?.trim() || undefined,
      color: details?.color || colorFromName(clean),
      upiId: details?.upiId?.trim().toLowerCase() || undefined,
      phone: details?.phone?.trim() || undefined,
      email: details?.email?.trim().toLowerCase() || undefined,
      preferredUpiApp: details?.preferredUpiApp ?? 'any',
      quickOpenUpi: details?.quickOpenUpi ?? false,
      defaultSharePercent: details?.defaultSharePercent,
      monthlyBudgetPaise: details?.monthlyBudgetPaise,
      city: details?.city?.trim() || undefined,
      notes: details?.notes?.trim() || undefined,
      isVirtual: details?.isVirtual ?? false,
      role: details?.role ?? 'member',
      joinedVia: details?.joinedVia ?? 'manual',
      lastActiveAt: details?.lastActiveAt,
      joinedAt: Date.now(),
    }
    setState((s) => {
      if (s.members.length >= 8 || s.members.some((m) => m.name.toLowerCase() === clean.toLowerCase())) return s
      return {
        ...s,
        members: [...s.members, member],
        room: s.room && !member.isVirtual ? { ...s.room, mode: 'shared', updatedAt: Date.now() } : s.room,
      }
    })
    if (current.room?.mode === 'personal') {
      pushToast({ message: 'Roommate added. Past personal expenses keep their original splits. New expenses can be shared.', tone: 'ok' })
    }
    if (meta) {
      runCloudSync(async () => {
        await cloudAddPlaceholder(meta.roomId, clean, { ...details, color: member.color })
        await cloudRefresh()
      }, 'Could not add the member to the cloud.')
    }
    return member
  }, [cloudActiveMeta, cloudRefresh, pushToast, runCloudSync])

  const updateMember = useCallback((id: string, patch: Partial<Member>) => {
    const current = stateRef.current
    const target = current.members.find((m) => m.id === id)
    if (!target) return
    const meta = cloudActiveMeta()
    if (current.room?.cloud) {
      if (!meta || !canEditMember(target, meta.memberId)) {
        pushToast({ message: 'You cannot change another claimed member’s profile.', tone: 'bad' })
        return
      }
      if (target.id !== meta.memberId && (patch.role || patch.userId !== undefined || patch.loginUsername)) {
        pushToast({ message: 'Member login identity can change only through the server claim or reset flow.', tone: 'bad' })
        return
      }
    }
    const nextMember = { ...target, ...patch }
    setState((s) => {
      const members = s.members.map((m) => (m.id === id ? { ...m, ...patch } : m))
      const edited = members.find((m) => m.id === id)
      const isMe = s.profile.memberId === id || (!s.profile.memberId && edited && s.profile.name === s.members.find((m) => m.id === id)?.name)
      return {
        ...s,
        members,
        profile: isMe && edited ? { ...s.profile, memberId: id, name: edited.name } : s.profile,
      }
    })
    if (meta) {
      runCloudSync(async () => {
        if (id === meta.memberId) await cloudUpdateMyProfile(meta.roomId, nextMember)
        else await cloudUpdatePlaceholder(nextMember)
      }, 'Could not save the profile to the cloud.')
    }
  }, [canEditMember, cloudActiveMeta, pushToast, runCloudSync])

  const removeMember = useCallback((id: string) => {
    const current = stateRef.current
    if (current.room?.cloud) {
      pushToast({ message: 'Members with financial history cannot be deleted from a cloud room. An admin can reset their login.', tone: 'warn' })
      return
    }
    if (current.room?.demo) {
      setState((s) => {
        const remaining = s.members.filter((m) => m.id !== id)
        const expenses = s.expenses.flatMap((expense) => {
          // The demo is disposable sample data: drop sample bills paid by the
          // removed person, and rebalance remaining sample shares fairly.
          if (expense.payerId === id) return []
          const sharers = expense.splits.filter((split) => split.memberId !== id)
          if (!sharers.length) return []
          if (sharers.length === expense.splits.length) return [expense]
          const base = Math.floor(expense.amountPaise / sharers.length)
          const remainder = expense.amountPaise - base * sharers.length
          return [{ ...expense, splitMode: 'equal' as const, splits: sharers.map((split, index) => ({ memberId: split.memberId, paise: base + (index < remainder ? 1 : 0) })) }]
        })
        const nextMe = remaining.find((m) => m.id === s.profile.memberId) ?? remaining[0]
        return {
          ...s,
          members: remaining,
          expenses,
          settlements: s.settlements.filter((item) => item.fromId !== id && item.toId !== id),
          recurring: s.recurring.filter((item) => item.payerId !== id),
          profile: { ...s.profile, memberId: nextMe?.id, name: nextMe?.name ?? '' },
        }
      })
      return
    }
    setState((s) => {
      const remainingMembers = s.members.filter((m) => m.id !== id)
      const activeCount = remainingMembers.filter((member) => !member.isVirtual).length
      return {
      ...s,
      members: remainingMembers,
      room: s.room ? { ...s.room, mode: activeCount <= 1 ? 'personal' : 'shared', updatedAt: Date.now() } : null,
      expenses: s.expenses.map((e) => ({ ...e, splits: e.splits.filter((sp) => sp.memberId !== id) })),
      settlements: s.settlements.filter((item) => item.fromId !== id && item.toId !== id),
      recurring: s.recurring.filter((item) => item.payerId !== id),
      }
    })
  }, [pushToast])

  const updateRoom = useCallback((patch: Partial<NonNullable<AppState['room']>>) => {
    const current = stateRef.current
    if (!current.room) return
    const meta = cloudActiveMeta()
    if (current.room.cloud && (!meta || (meta.role !== 'owner' && meta.role !== 'admin'))) {
      pushToast({ message: 'Only a cloud room admin or owner can change room settings.', tone: 'bad' })
      return
    }
    const nextRoom = { ...current.room, ...patch, updatedAt: Date.now() }
    setState((s) => (s.room ? { ...s, room: { ...s.room, ...patch, updatedAt: Date.now() } } : s))
    if (meta) runCloudSync(() => cloudUpdateRoomSettings(nextRoom), 'Could not save room settings to the cloud.')
  }, [cloudActiveMeta, pushToast, runCloudSync])

  /** Is device par active member/account badlo — uska personal dashboard khulega. */
  const setCurrentMember = useCallback((memberId: string): boolean => {
    const member = stateRef.current.members.find((m) => m.id === memberId && !m.isVirtual)
    if (!member) return false
    const meta = cloudActiveMeta()
    if (stateRef.current.room?.cloud && (!meta || meta.memberId !== memberId)) {
      pushToast({ message: 'Cloud identity cannot be switched. Each member must use their own login.', tone: 'warn' })
      return false
    }
    setState((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === memberId ? { ...m, lastActiveAt: Date.now() } : m)),
      profile: { ...s.profile, memberId, name: member.name, onboarded: true },
    }))
    return true
  }, [])

  /** Invite-link/sync-file se room join ya update karo. */
  const applyRoomSyncPacket = useCallback((packet: RoomSyncPacket, selection: JoinSelection = {}): { ok: boolean; memberId?: string; error?: string } => {
    const current = stateRef.current
    if (current.room?.cloud) {
      return { ok: false, error: 'A cloud room is active. Sign out of cloud in Settings before importing an offline packet.' }
    }
    const differentRoom = !!current.room && current.room.id !== packet.room.id && current.room.code !== packet.room.code
    if (differentRoom && !selection.replaceDifferentRoom) {
      return { ok: false, error: 'Another room is open in this browser. Back it up first, then confirm replacement.' }
    }

    let next = mergeRoomSyncPacket(current, packet)
    let memberId = selection.memberId

    const newName = selection.newMemberName?.trim()
    if (newName) {
      if (next.members.length >= 8) return { ok: false, error: 'The room is full. Maximum 8 members can join.' }
      if (next.members.some((m) => m.name.toLowerCase() === newName.toLowerCase())) {
        return { ok: false, error: `"${newName}" is already in this room. Select your name above.` }
      }
      const d = selection.newMemberDetails ?? {}
      const member: Member = {
        id: uid('m_'),
        name: newName,
        fullName: d.fullName?.trim() || undefined,
        color: d.color || colorFromName(newName),
        upiId: d.upiId?.trim().toLowerCase() || undefined,
        phone: d.phone?.trim() || undefined,
        email: d.email?.trim().toLowerCase() || undefined,
        preferredUpiApp: d.preferredUpiApp ?? 'any',
        quickOpenUpi: d.quickOpenUpi ?? false,
        defaultSharePercent: d.defaultSharePercent,
        monthlyBudgetPaise: d.monthlyBudgetPaise,
        city: d.city?.trim() || undefined,
        notes: d.notes?.trim() || undefined,
        isVirtual: false,
        role: 'member',
        joinedVia: 'invite',
        lastActiveAt: Date.now(),
        joinedAt: Date.now(),
      }
      next = { ...next, members: [...next.members, member] }
      memberId = member.id
    }

    const active = next.members.find((m) => m.id === memberId && !m.isVirtual)
    if (!active) return { ok: false, error: 'Select who you are or join as a new member.' }

    next = {
      ...next,
      members: next.members.map((m) => (m.id === active.id ? { ...m, lastActiveAt: Date.now(), joinedVia: m.joinedVia ?? 'invite' } : m)),
      profile: { ...next.profile, memberId: active.id, name: active.name, onboarded: true },
    }
    setState(next)
    pushToast({ message: `${active.name}, you joined ${next.room?.name ?? 'the room'}.`, tone: 'ok' })
    return { ok: true, memberId: active.id }
  }, [pushToast])

  // ── EXPENSES ──────────────────────────────────────────────
  const addExpense = useCallback((draft: NewExpense): Expense => {
    const meta = cloudActiveMeta()
    const payerId = meta ? meta.memberId : draft.payerId
    if (meta && draft.payerId !== meta.memberId) {
      pushToast({ message: 'For cloud security, expenses are saved under your own name.', tone: 'warn' })
    }
    const e: Expense = {
      id: uid('e_'),
      roomId: stateRef.current.room?.id ?? 'local',
      description: draft.description.trim() || 'Expense',
      category: draft.category,
      amountPaise: Math.max(0, Math.round(draft.amountPaise)),
      payerId,
      createdByUserId: meta?.userId,
      method: draft.method,
      splitMode: draft.splitMode,
      splits: draft.splits,
      photoUrl: draft.photoUrl,
      note: draft.note,
      vendorName: draft.vendorName?.trim() || undefined,
      vendorUpiId: draft.vendorUpiId?.trim().toLowerCase() || undefined,
      instantPay: draft.instantPay,
      source: draft.source ?? 'manual',
      confidence: draft.confidence,
      rawText: draft.rawText,
      status: draft.status ?? 'confirmed',
      reactions: {},
      createdAt: draft.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      version: 1,
    }
    setState((s) => ({ ...s, expenses: [e, ...s.expenses] }))
    if (meta) runCloudSync(() => cloudPushExpense(e), 'Could not save the expense to the cloud.')
    // ⭐ merchant memory — seekhna shuru
    const mer = detectMerchant(e.description)
    if (mer) {
      setState((s) => {
        const idx = s.merchants.findIndex((m) => m.key === mer.key)
        if (idx === -1) return { ...s, merchants: [...s.merchants, { key: mer.key, displayName: mer.display, defaultCategory: e.category, defaultSplitMode: e.splitMode, hits: 1 }] }
        const next = [...s.merchants]
        next[idx] = { ...next[idx], hits: next[idx].hits + 1, defaultCategory: e.category, defaultSplitMode: e.splitMode }
        return { ...s, merchants: next }
      })
    }
    return e
  }, [cloudActiveMeta, pushToast, runCloudSync])

  const updateExpense = useCallback((id: string, patch: Partial<Expense>) => {
    const current = stateRef.current.expenses.find((e) => e.id === id)
    if (!current) return
    const meta = cloudActiveMeta()
    if (stateRef.current.room?.cloud && (!meta || !canEditExpense(current, meta.memberId) || (patch.payerId !== undefined && patch.payerId !== meta.memberId))) {
      pushToast({ message: 'You cannot edit another member’s expense.', tone: 'bad' })
      return
    }
    const next = { ...current, ...patch, payerId: meta ? meta.memberId : (patch.payerId ?? current.payerId), updatedAt: Date.now(), version: current.version + 1 }
    setState((s) => ({
      ...s,
      expenses: s.expenses.map((e) => (e.id === id ? next : e)),
    }))
    if (meta) runCloudSync(() => cloudPushExpense(next), 'Could not update the expense in the cloud.')
  }, [canEditExpense, cloudActiveMeta, pushToast, runCloudSync])

  const restoreDeletedExpense = useCallback((id: string) => {
    const record = deletedExpenses.find((item) => item.expense.id === id)
    if (!record) return
    const backup = record.expense
    const meta = cloudActiveMeta()
    if (stateRef.current.room?.cloud && (!meta || !canEditExpense(backup, meta.memberId))) {
      pushToast({ message: 'You cannot restore another member’s expense.', tone: 'bad' })
      return
    }
    setState((s) => ({ ...s, expenses: s.expenses.some((item) => item.id === id) ? s.expenses : [backup, ...s.expenses] }))
    setDeletedExpenses((items) => items.filter((item) => item.expense.id !== id))
    if (meta) runCloudSync(() => cloudPushExpense({ ...backup, deleted: false }), 'Could not restore the expense in the cloud.')
    pushToast({ message: 'Expense restored to History.', tone: 'ok' })
  }, [deletedExpenses, canEditExpense, cloudActiveMeta, pushToast, runCloudSync])

  const deleteExpense = useCallback((id: string) => {
    const backup = stateRef.current.expenses.find((e) => e.id === id) ?? null
    if (!backup) return
    const meta = cloudActiveMeta()
    if (stateRef.current.room?.cloud && (!meta || !canEditExpense(backup, meta.memberId))) {
      pushToast({ message: 'You cannot delete another member’s expense.', tone: 'bad' })
      return
    }
    const deletedAt = Date.now()
    setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }))
    setDeletedExpenses((items) => [{ expense: backup, deletedAt }, ...items.filter((item) => item.expense.id !== id && Date.now() - item.deletedAt <= DELETED_EXPENSE_TTL_MS)].slice(0, 100))
    if (meta) runCloudSync(() => cloudPushExpense({ ...backup, deleted: true }), 'Could not delete the expense from the cloud.')
    pushToast({
      message: 'Expense deleted. You can restore it from Recently deleted for 30 days.',
      tone: 'warn',
      actionLabel: 'Undo',
      onAction: () => restoreDeletedExpense(id),
    })
  }, [canEditExpense, cloudActiveMeta, pushToast, runCloudSync, restoreDeletedExpense])

  const reactExpense = useCallback((id: string, emoji: string, memberId: string) => {
    const meta = cloudActiveMeta()
    const effectiveMemberId = meta ? meta.memberId : memberId
    const expense = stateRef.current.expenses.find((e) => e.id === id)
    if (!expense) return
    const has = (expense.reactions[emoji] ?? []).includes(effectiveMemberId)
    setState((s) => ({
      ...s,
      expenses: s.expenses.map((e) => {
        if (e.id !== id) return e
        const list = e.reactions[emoji] ?? []
        return { ...e, reactions: { ...e.reactions, [emoji]: has ? list.filter((x) => x !== effectiveMemberId) : [...list, effectiveMemberId] } }
      }),
    }))
    if (meta) runCloudSync(() => cloudPushReaction(meta.roomId, id, effectiveMemberId, emoji, !has), 'Could not save the reaction to the cloud.')
  }, [cloudActiveMeta, runCloudSync])

  // ── SETTLEMENTS ───────────────────────────────────────────
  const settle = useCallback((fromId: string, toId: string, amountPaise: number, method: Settlement['method'], confirmedBy: string[]) => {
    const meta = cloudActiveMeta()
    if (meta && meta.memberId !== fromId && meta.memberId !== toId) {
      pushToast({ message: 'In a cloud room, you can create a settlement only for your own payment.', tone: 'bad' })
      return
    }
    const settlement: Settlement = {
      id: uid('s_'),
      roomId: stateRef.current.room?.id ?? 'local',
      fromId,
      toId,
      amountPaise,
      method,
      // Server par koi dusre ki taraf se confirm nahi kar sakta.
      confirmedBy: meta ? [meta.memberId] : confirmedBy,
      createdAt: Date.now(),
    }
    setState((s) => ({ ...s, settlements: [...s.settlements, settlement] }))
    if (meta) runCloudSync(() => cloudPushSettlement(settlement, meta.memberId), 'Could not save the settlement to the cloud.')
  }, [cloudActiveMeta, pushToast, runCloudSync])

  const confirmSettlement = useCallback((id: string, memberId: string) => {
    const meta = cloudActiveMeta()
    if (meta && memberId !== meta.memberId) {
      pushToast({ message: 'The other member must confirm from their own login.', tone: 'warn' })
      return
    }
    const settlement = stateRef.current.settlements.find((x) => x.id === id)
    if (!settlement || settlement.confirmedBy.includes(memberId)) return
    setState((s) => ({
      ...s,
      settlements: s.settlements.map((x) =>
        x.id === id && !x.confirmedBy.includes(memberId) ? { ...x, confirmedBy: [...x.confirmedBy, memberId] } : x,
      ),
    }))
    if (meta) runCloudSync(() => cloudConfirmSettlement(meta.roomId, id, memberId), 'Could not save the settlement confirmation to the cloud.')
  }, [cloudActiveMeta, pushToast, runCloudSync])

  // ─️ INBOX / AUTOMATION ────────────────────────────────────
  const ingestSMS = useCallback((raw: string): { item: InboxItem | null; error?: string } => {
    const parsed = parseBankSMS(raw)
    if (!parsed) return { item: null, error: 'No amount was found in this SMS. Paste the complete message.' }
    if (parsed.direction === 'credit') return { item: null, error: 'This is a credit, not an expense. It was ignored.' }

    const current = stateRef.current
    const key = dedupeKey(parsed)
    const isDup = current.inbox.some((i) => i.status !== 'ignored' && i.parsed && dedupeKey(i.parsed) === key)
      || current.expenses.some((e) => !!e.rawText && (() => {
          const again = parseBankSMS(e.rawText as string)
          return !!again && dedupeKey(again) === key
        })())
    if (isDup) return { item: null, error: 'This transaction was already captured and will not be counted twice.' }

    const item: InboxItem = {
      id: uid('in_'), rawText: raw.trim(), parsed, confidence: parsed.confidence,
      source: 'sms', createdAt: Date.now(), status: 'new',
    }
    setState((s) => {
      // state update ke beech duplicate aa gaya ho to bhi rokna
      if (s.inbox.some((i) => i.status !== 'ignored' && i.parsed && dedupeKey(i.parsed) === key)) return s
      return { ...s, inbox: [item, ...s.inbox].slice(0, 150) }
    })
    return { item }
  }, [])

  /** Statement CSV / share-target se aaye hue parsed items bulk me Inbox me daalo */
  const ingestParsedBatch = useCallback((
    items: { parsed: ParsedTransaction; rawText: string; source?: InboxItem['source'] }[],
  ): { added: number; duplicates: number } => {
    let added = 0
    let duplicates = 0
    setState((s) => {
      const seen = new Set<string>()
      s.inbox.filter((i) => i.status !== 'ignored' && i.parsed).forEach((i) => seen.add(dedupeKey(i.parsed as ParsedTransaction)))
      s.expenses.forEach((e) => {
        if (!e.rawText) return
        const again = parseBankSMS(e.rawText)
        if (again) seen.add(dedupeKey(again))
      })
      const fresh: InboxItem[] = []
      for (const it of items) {
        if (it.parsed.direction === 'credit') continue
        const k = dedupeKey(it.parsed)
        if (seen.has(k)) { duplicates++; continue }
        seen.add(k)
        fresh.push({
          id: uid('in_'), rawText: it.rawText, parsed: it.parsed,
          confidence: it.parsed.confidence, source: it.source ?? 'sms',
          createdAt: it.parsed.date ?? Date.now(), status: 'new',
        })
      }
      added = fresh.length
      return { ...s, inbox: [...fresh, ...s.inbox].slice(0, 250) }
    })
    return { added, duplicates }
  }, [])

  const acceptInboxItem = useCallback((id: string, patch?: Partial<Expense>) => {
    const s = stateRef.current
    const item = s.inbox.find((i) => i.id === id)
    if (!item || !item.parsed) return
    const meta = cloudActiveMeta()
    const p = item.parsed
    const payer = meta ? s.members.find((m) => m.id === meta.memberId) : s.members[0]
    if (!payer) return
    const auto = resolveAuto(s, p)
    const parsedPayer = p.payerId ? s.members.find((m) => m.id === p.payerId) : undefined
    const payerId = meta ? meta.memberId : (patch?.payerId ?? parsedPayer?.id ?? payer.id)
    const sharerIds = patch?.splits ? patch.splits.map((x) => x.memberId) : auto.sharerIds
    const per = splitEqual(p.amountPaise, sharerIds.length)
    const e: Expense = {
      id: uid('e_'), roomId: s.room?.id ?? 'local',
      description: patch?.description ?? p.merchant,
      category: (patch?.category ?? auto.category) as Expense['category'],
      amountPaise: p.amountPaise,
      payerId,
      createdByUserId: meta?.userId,
      method: patch?.method ?? p.methodGuess,
      splitMode: patch?.splitMode ?? auto.splitMode,
      splits: patch?.splits ?? sharerIds.map((mid, i) => ({ memberId: mid, paise: per[i] })),
      source: item.source, confidence: item.confidence, rawText: item.rawText,
      status: 'confirmed', reactions: {},
      createdAt: patch?.createdAt ?? p.date ?? item.createdAt,
      updatedAt: Date.now(), version: 1,
    }
    setState((current) => {
      if (!current.inbox.some((i) => i.id === id && i.status === 'new')) return current
      const merchants = [...current.merchants]
      const idx = merchants.findIndex((m) => m.key === p.merchantKey)
      if (idx === -1) merchants.push({ key: p.merchantKey, displayName: p.merchant, defaultCategory: e.category, defaultSplitMode: e.splitMode, hits: 1 })
      else merchants[idx] = { ...merchants[idx], hits: merchants[idx].hits + 1, defaultCategory: e.category, defaultSplitMode: e.splitMode }
      return {
        ...current,
        expenses: [e, ...current.expenses],
        merchants,
        inbox: current.inbox.map((i) => (i.id === id ? { ...i, status: 'confirmed', expenseId: e.id } : i)),
      }
    })
    if (meta) runCloudSync(() => cloudPushExpense(e), 'Could not save the Auto Capture expense to the cloud.')
  }, [cloudActiveMeta, runCloudSync])

  const ignoreInboxItem = useCallback((id: string) => {
    setState((s) => ({ ...s, inbox: s.inbox.map((i) => (i.id === id ? { ...i, status: 'ignored' } : i)) }))
  }, [])

  const acceptAllHighConfidence = useCallback((threshold = 90): number => {
    const s = stateRef.current
    const meta = cloudActiveMeta()
    const created: Expense[] = []
    const acceptedIds = new Map<string, string>()
    for (const item of s.inbox.filter((i) => i.status === 'new' && i.confidence >= threshold)) {
      if (!item.parsed) continue
      const p = item.parsed
      const payer = meta ? s.members.find((m) => m.id === meta.memberId) : s.members[0]
      if (!payer) break
      const auto = resolveAuto(s, p)
      const per = splitEqual(p.amountPaise, auto.sharerIds.length)
      const e: Expense = {
        id: uid('e_'), roomId: s.room?.id ?? 'local', description: p.merchant,
        category: auto.category, amountPaise: p.amountPaise, payerId: payer.id,
        createdByUserId: meta?.userId,
        method: p.methodGuess, splitMode: auto.splitMode,
        splits: auto.sharerIds.map((mid, i) => ({ memberId: mid, paise: per[i] })),
        source: item.source, confidence: item.confidence, rawText: item.rawText,
        status: 'confirmed', reactions: {}, createdAt: p.date ?? item.createdAt,
        updatedAt: Date.now(), version: 1,
      }
      created.push(e)
      acceptedIds.set(item.id, e.id)
    }
    if (created.length) {
      setState((current) => ({
        ...current,
        expenses: [...created, ...current.expenses],
        inbox: current.inbox.map((i) => acceptedIds.has(i.id) ? { ...i, status: 'confirmed', expenseId: acceptedIds.get(i.id) } : i),
      }))
      if (meta) runCloudSync(async () => {
        for (const expense of created) await cloudPushExpense(expense)
      }, 'Could not save the Auto Capture batch to the cloud.')
    }
    return created.length
  }, [cloudActiveMeta, runCloudSync])

  // ── RECURRING + RULES ─────────────────────────────────────
  const upsertRecurring = useCallback((r: Recurring) => {
    const meta = cloudActiveMeta()
    if (meta && r.payerId !== meta.memberId) {
      pushToast({ message: 'Cloud recurring bills can be created only under your own name as payer.', tone: 'bad' })
      return
    }
    const next = meta ? { ...r, roomId: meta.roomId, payerId: meta.memberId } : r
    setState((s) => {
      const exists = s.recurring.some((x) => x.id === next.id)
      return { ...s, recurring: exists ? s.recurring.map((x) => (x.id === next.id ? next : x)) : [...s.recurring, next] }
    })
    if (meta) runCloudSync(() => cloudPushRecurring(next), 'Could not save the recurring bill to the cloud.')
  }, [cloudActiveMeta, pushToast, runCloudSync])

  const toggleRecurring = useCallback((id: string) => {
    const target = stateRef.current.recurring.find((r) => r.id === id)
    if (!target) return
    const meta = cloudActiveMeta()
    if (meta && target.payerId !== meta.memberId) {
      pushToast({ message: 'You cannot enable or disable another member’s recurring bill.', tone: 'bad' })
      return
    }
    const next = { ...target, active: !target.active }
    setState((s) => ({ ...s, recurring: s.recurring.map((r) => (r.id === id ? next : r)) }))
    if (meta) runCloudSync(() => cloudPushRecurring(next), 'Could not update the recurring bill in the cloud.')
  }, [cloudActiveMeta, pushToast, runCloudSync])

  const deleteRecurring = useCallback((id: string) => {
    const target = stateRef.current.recurring.find((r) => r.id === id)
    if (!target) return
    const meta = cloudActiveMeta()
    if (meta && target.payerId !== meta.memberId) {
      pushToast({ message: 'You cannot delete another member’s recurring bill.', tone: 'bad' })
      return
    }
    setState((s) => ({ ...s, recurring: s.recurring.filter((r) => r.id !== id) }))
    if (meta) runCloudSync(() => cloudDeleteRecurring(id), 'Could not delete the recurring bill from the cloud.')
  }, [cloudActiveMeta, pushToast, runCloudSync])

  /** Prepare due recurring bills for review; do not update balances until approved. */
  const runDueRecurring = useCallback((): number => {
    const s = stateRef.current
    const meta = cloudActiveMeta()
    const now = new Date()
    const key = `${now.getFullYear()}-${now.getMonth()}`
    const created: Expense[] = []
    const changed: Recurring[] = []
    const recurring = s.recurring.map((r) => {
      if (!r.active || r.lastRunKey === key || now.getDate() < (r.dayOfMonth ?? 1)) return r
      if (meta && r.payerId !== meta.memberId) return r
      const sharers = s.members.filter((m) => !m.isVirtual)
      if (!sharers.length) return r
      const per = splitEqual(r.amountPaise, sharers.length)
      const e: Expense = {
        id: uid('e_'), roomId: s.room?.id ?? 'local', description: r.description,
        category: r.category, amountPaise: r.amountPaise, payerId: r.payerId || s.members[0]?.id,
        createdByUserId: meta?.userId,
        method: r.method, splitMode: r.splitMode, splits: sharers.map((m, i) => ({ memberId: m.id, paise: per[i] })),
        source: 'recurring', status: 'pending', reactions: {},
        createdAt: Date.now(), updatedAt: Date.now(), version: 1,
      }
      created.push(e)
      const updated = { ...r, lastRunKey: key }
      changed.push(updated)
      return updated
    })
    if (created.length) {
      setState((current) => ({ ...current, expenses: [...created, ...current.expenses], recurring }))
      if (meta) runCloudSync(async () => {
        for (const expense of created) await cloudPushExpense(expense)
        for (const item of changed) await cloudPushRecurring(item)
      }, 'Could not save the recurring entry to the cloud.')
    }
    return created.length
  }, [cloudActiveMeta, runCloudSync])

  const upsertRule = useCallback((r: Rule) => {
    setState((s) => {
      const exists = s.rules.some((x) => x.id === r.id)
      return { ...s, rules: exists ? s.rules.map((x) => (x.id === r.id ? r : x)) : [...s.rules, r] }
    })
  }, [])

  const toggleRule = useCallback((id: string) => {
    setState((s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)) }))
  }, [])

  const deleteRule = useCallback((id: string) => {
    setState((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }))
  }, [])

  // ── PROFILE / DATA ────────────────────────────────────────
  const updateProfile = useCallback((patch: Partial<AppState['profile']>) => {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }))
  }, [])

  const resetAll = useCallback(() => {
    cloudMetaRef.current = null
    clearCloudMeta()
    if (isCloudConfigured) void cloudSignOut().catch(() => undefined)
    setCloud({ configured: isCloudConfigured, status: 'local', availableRooms: [] })
    setState(emptyState())
  }, [])

  const wipeData = useCallback(() => {
    cloudMetaRef.current = null
    if (isCloudConfigured) void cloudSignOut().catch(() => undefined)
    wipeAllData()
    clearCloudMeta()
    setCloud({ configured: isCloudConfigured, status: 'local', availableRooms: [] })
    setState(emptyState())
    pushToast({ message: 'Local data was deleted. Cloud data remains on the server and will return after sign-in.', tone: 'warn' })
  }, [pushToast])

  const importState = useCallback((json: string): boolean => {
    if (stateRef.current.room?.cloud) {
      pushToast({ message: 'A cloud room is active. Sign out of cloud before importing a local backup.', tone: 'bad' })
      return false
    }
    const st = importJSON(json)
    if (!st) { pushToast({ message: 'Import failed. The file is corrupt or in the wrong format.', tone: 'bad' }); return false }
    setState(st)
    pushToast({ message: 'Backup restored.', tone: 'ok' })
    return true
  }, [pushToast])

  const value = useMemo<Ctx>(() => ({
    state, ready,
    cloud,
cloudLogin, cloudLogout, cloudRefresh, cloudOpenRoom, cloudCreateRoom, cloudMigrateLocalRoom, cloudClaimInvite, cloudRecoverWithKey, createCloudInviteLink,
    isCloudRoomActive: Boolean(state.room?.cloud && cloud.roomId === state.room.id && cloud.memberId),
    canEditExpense, canEditMember,
    toasts, deletedExpenses, restoreDeletedExpense, pushToast, dismissToast,
    createRoom, loadDemo, resetDemo, exitDemo, addMember, updateMember, removeMember, updateRoom, setCurrentMember, applyRoomSyncPacket,
    addExpense, updateExpense, deleteExpense, reactExpense,
    settle, confirmSettlement,
    ingestSMS, ingestParsedBatch, acceptInboxItem, ignoreInboxItem, acceptAllHighConfidence,
    upsertRecurring, toggleRecurring, deleteRecurring, runDueRecurring, upsertRule, toggleRule, deleteRule,
    updateProfile, resetAll, wipeData, importState,
  }), [state, ready, cloud, cloudLogin, cloudLogout, cloudRefresh, cloudOpenRoom, cloudCreateRoom, cloudMigrateLocalRoom, cloudClaimInvite, cloudRecoverWithKey, createCloudInviteLink, canEditExpense, canEditMember, toasts, deletedExpenses, restoreDeletedExpense, pushToast, dismissToast, createRoom, loadDemo, resetDemo, exitDemo, addMember, updateMember, removeMember, updateRoom, setCurrentMember, applyRoomSyncPacket, addExpense, updateExpense, deleteExpense, reactExpense, settle, confirmSettlement, ingestSMS, ingestParsedBatch, acceptInboxItem, ignoreInboxItem, acceptAllHighConfidence, upsertRecurring, toggleRecurring, deleteRecurring, runDueRecurring, upsertRule, toggleRule, deleteRule, updateProfile, resetAll, wipeData, importState])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

/** selectors — component re-render kam karne ke liye */
export function useRoomData() {
  const { state } = useStore()
  return useMemo(() => {
    const members = stableMembers(state.members)
    return {
      room: state.room,
      members,
      expenses: stableExpenses(state.expenses),
      settlements: [...state.settlements].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)),
      me: members.find((m) => m.id === state.profile.memberId)
        ?? members.find((m) => m.name === state.profile.name)
        ?? members.find((m) => !m.isVirtual)
        ?? members[0]
        ?? null,
    }
  }, [state.room, state.members, state.expenses, state.settlements, state.profile.memberId, state.profile.name])
}
