// ─────────────────────────────────────────────────────────────
// LOCAL-FIRST STORAGE  ⭐
// Pura data browser me (localStorage) rehta hai → app bina internet,
// bina database, bina login 100% chalti hai. ₹0 cost.
// Baad me Supabase sync layer plug ho jaayegi (Module 3) — architecture ready hai.
// ─────────────────────────────────────────────────────────────
import type { AppState } from './types'
import { APP } from './constants'

const KEY = APP.storageKey
const DEMO_KEY = `${APP.storageKey}.demo`
const DEMO_ACTIVE_KEY = `${APP.storageKey}.demo.active`
const SCHEMA_VERSION = 1

export function emptyState(): AppState {
  return {
    version: SCHEMA_VERSION,
    room: null,
    members: [],
    expenses: [],
    settlements: [],
    recurring: [],
    rules: [],
    merchants: [],
    inbox: [],
    profile: {
      id: 'me',
      name: '',
      theme: 'system',
      language: 'en',
      reduceMotion: false,
      onboarded: false,
    },
  }
}

export function isLegacyDemoState(state: Partial<AppState>): boolean {
  const names = (state.members ?? []).map((member) => member.name).join('|')
  const expenses = state.expenses ?? []
  return !state.room?.cloud
    && state.room?.name === "Komal's Room"
    && names === 'Komal|Amit|Rohit'
    && expenses.length >= 12
    && expenses.some((expense) => expense.description === 'October Rent')
}

export function loadState(): AppState {
  if (typeof window === 'undefined') return emptyState()
  try {
    const demoActive = window.localStorage.getItem(DEMO_ACTIVE_KEY) === '1'
    const raw = (demoActive ? window.localStorage.getItem(DEMO_KEY) : null) ?? window.localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    // migration-safe merge: nayi field purane data me missing ho to default aa jaaye
    const base = emptyState()
    const savedMembers = parsed.members ?? []
    const savedExpenses = parsed.expenses ?? []
    const oldSampleRoom = isLegacyDemoState(parsed)
    return {
      ...base,
      ...parsed,
      room: parsed.room ? {
        ...parsed.room,
        demo: parsed.room.demo ?? oldSampleRoom,
        mode: parsed.room.mode ?? (savedMembers.filter((member) => !member.isVirtual).length > 1 ? 'shared' : 'personal'),
      } : null,
      version: SCHEMA_VERSION,
      profile: { ...base.profile, ...(parsed.profile ?? {}) },
      members: savedMembers,
      expenses: savedExpenses,
      settlements: parsed.settlements ?? [],
      recurring: parsed.recurring ?? [],
      rules: parsed.rules ?? [],
      merchants: parsed.merchants ?? [],
      inbox: parsed.inbox ?? [],
    }
  } catch (err) {
    console.error('[RoomHisaab] state load fail — fresh start', err)
    return emptyState()
  }
}

let saveTimer: number | undefined
let pendingState: AppState | null = null
let flushListenersReady = false

function flushStateSave(): void {
  if (typeof window === 'undefined' || !pendingState) return
  window.clearTimeout(saveTimer)
  const stateToSave = pendingState
  pendingState = null
  try {
    const demo = stateToSave.room?.demo === true
    window.localStorage.setItem(demo ? DEMO_KEY : KEY, JSON.stringify(stateToSave))
    window.localStorage.setItem(DEMO_ACTIVE_KEY, demo ? '1' : '0')
  } catch (err) {
    console.error('[RoomHisaab] save fail (quota?)', err)
  }
}

export function flushPendingStateSave(): void {
  flushStateSave()
}

export function clearDemoState(): void {
  if (typeof window === 'undefined') return
  flushStateSave()
  try {
    window.localStorage.removeItem(DEMO_KEY)
    window.localStorage.setItem(DEMO_ACTIVE_KEY, '0')
  } catch { /* ignore */ }
}

function ensureFlushListeners(): void {
  if (flushListenersReady || typeof window === 'undefined') return
  flushListenersReady = true
  window.addEventListener('pagehide', flushStateSave)
  window.addEventListener('beforeunload', flushStateSave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStateSave()
  })
}

/** Debounced save for performance, flushed immediately before the page closes. */
export function saveState(state: AppState): void {
  if (typeof window === 'undefined') return
  ensureFlushListeners()
  pendingState = state
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flushStateSave, 250)
}

export function clearState(): void {
  if (typeof window !== 'undefined') window.clearTimeout(saveTimer)
  pendingState = null
  try { window.localStorage.removeItem(KEY); window.localStorage.setItem(DEMO_ACTIVE_KEY, '0') } catch { /* ignore */ }
}

/** ⭐ "Delete my data" — sach me delete kare, sirf hide na kare */
export function wipeAllData(): void {
  clearState()
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('roomhisaab'))
      .forEach((k) => window.localStorage.removeItem(k))
  } catch { /* ignore */ }
}

/** backup / export — JSON file me pura hisaab */
export function exportJSON(state: AppState): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), app: APP.name, state }, null, 2)
}

/** Import with validation. A cloud backup becomes a clearly local copy. */
export function importJSON(raw: string): AppState | null {
  try {
    const parsed = JSON.parse(raw)
    const st = (parsed.state ?? parsed) as Partial<AppState>
    if (!Array.isArray(st.expenses)) return null
    const imported = { ...emptyState(), ...st, version: SCHEMA_VERSION } as AppState
    if (!imported.room?.cloud) return imported
    return {
      ...imported,
      room: {
        ...imported.room,
        name: imported.room.name.endsWith(' (Local copy)') ? imported.room.name : `${imported.room.name} (Local copy)`,
        cloud: false,
        loginId: undefined,
      },
      members: imported.members.map((member) => ({
        ...member,
        userId: undefined,
        loginUsername: undefined,
        claimed: false,
        cloudStatus: undefined,
      })),
    }
  } catch {
    return null
  }
}
