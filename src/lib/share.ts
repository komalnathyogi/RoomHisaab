// ─────────────────────────────────────────────────────────────
// ROOM JOIN / SYNC PACKET (free, offline-first)
// Bina backend ke dusre phone tak room bhejne ka honest tareeka:
// room + members + expenses ko ek compressed packet bana kar
// invite-link (#packet=...) ya sync-file me bhejte hain.
// Hash (#) wala data browser server ko nahi bhejta.
// NOTE: Yeh live cloud sync nahi hai — naya kharcha ho to latest
// sync link/file dobara bhejna padega. Live multi-device sync ke
// liye Supabase jaisa backend lagega (next phase).
// ─────────────────────────────────────────────────────────────
import type { AppState, Expense, Member, MerchantMemory, Recurring, Room, Rule, Settlement } from './types'

export interface RoomSyncPacket {
  kind: 'roomhisaab-sync'
  version: 1
  exportedAt: number
  room: Room
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  recurring: Recurring[]
  rules: Rule[]
  merchants: MerchantMemory[]
}

const RAW_PREFIX = 'raw_'
const GZ_PREFIX = 'gz_'

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

function asArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : []
}

function validatePacket(x: unknown): RoomSyncPacket | null {
  if (!isRecord(x)) return null
  const room = x.room as Room | undefined
  if (!room || typeof room.id !== 'string' || typeof room.name !== 'string' || typeof room.code !== 'string') return null
  return {
    kind: 'roomhisaab-sync',
    version: 1,
    exportedAt: typeof x.exportedAt === 'number' ? x.exportedAt : Date.now(),
    room: { ...room, rentCycleDay: Math.min(Math.max(Number(room.rentCycleDay) || 1, 1), 28) },
    members: asArray<Member>(x.members),
    expenses: asArray<Expense>(x.expenses),
    settlements: asArray<Settlement>(x.settlements),
    recurring: asArray<Recurring>(x.recurring),
    rules: asArray<Rule>(x.rules),
    merchants: asArray<MerchantMemory>(x.merchants),
  }
}

export function packetFromState(state: AppState): RoomSyncPacket | null {
  if (!state.room) return null
  return validatePacket({
    kind: 'roomhisaab-sync',
    version: 1,
    exportedAt: Date.now(),
    room: state.room,
    members: state.members,
    expenses: state.expenses,
    settlements: state.settlements,
    recurring: state.recurring,
    rules: state.rules,
    merchants: state.merchants,
  })
}

/** Invite/sync ke liye halka packet — badi bill photo aur raw SMS text link me nahi bhejte. */
export function createRoomSyncPacket(state: AppState): RoomSyncPacket | null {
  if (!state.room) return null
  return {
    kind: 'roomhisaab-sync',
    version: 1,
    exportedAt: Date.now(),
    room: state.room,
    members: state.members,
    expenses: state.expenses.map(({ photoUrl: _photoUrl, rawText: _rawText, ...rest }) => rest as Expense),
    settlements: state.settlements,
    recurring: state.recurring,
    rules: state.rules,
    merchants: state.merchants,
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeRoomSyncPacketRaw(packet: RoomSyncPacket): string {
  return RAW_PREFIX + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(packet)))
}

export function decodeRoomSyncPacketRaw(encoded: string): RoomSyncPacket | null {
  try {
    const code = extractPacketCode(encoded)
    if (!code.startsWith(RAW_PREFIX)) return null
    const json = new TextDecoder().decode(base64UrlToBytes(code.slice(RAW_PREFIX.length)))
    return validatePacket(JSON.parse(json))
  } catch {
    return null
  }
}

async function streamToBytes(stream: ReadableStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function bytesToBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy])
}

export async function encodeRoomSyncPacket(packet: RoomSyncPacket): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(packet))
  try {
    const CS = (globalThis as unknown as { CompressionStream?: typeof CompressionStream }).CompressionStream
    if (CS) {
      const compressed = await streamToBytes(bytesToBlob(bytes).stream().pipeThrough(new CS('gzip')))
      const gz = GZ_PREFIX + bytesToBase64Url(compressed)
      const raw = RAW_PREFIX + bytesToBase64Url(bytes)
      return gz.length < raw.length ? gz : raw
    }
  } catch {
    /* raw fallback neeche */
  }
  return encodeRoomSyncPacketRaw(packet)
}

export function extractPacketCode(input: string): string {
  const text = (input ?? '').trim()
  if (!text) return ''
  const fromParam = text.match(/[#?&]packet=([^&\s]+)/)
  const code = fromParam ? fromParam[1] : text
  try { return decodeURIComponent(code) } catch { return code }
}

export async function decodeRoomSyncPacket(input: string): Promise<RoomSyncPacket | null> {
  const code = extractPacketCode(input)
  if (!code) return null
  if (code.startsWith(RAW_PREFIX)) return decodeRoomSyncPacketRaw(code)
  if (code.startsWith(GZ_PREFIX)) {
    try {
      const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
      if (!DS) return null
      const bytes = base64UrlToBytes(code.slice(GZ_PREFIX.length))
      const plain = await streamToBytes(bytesToBlob(bytes).stream().pipeThrough(new DS('gzip')))
      return validatePacket(JSON.parse(new TextDecoder().decode(plain)))
    } catch {
      return null
    }
  }
  // bina prefix ke aaya ho to raw base64url maan kar try karo
  return decodeRoomSyncPacketRaw(RAW_PREFIX + code)
}

/** Join page file/paste input: packet JSON, backup JSON, ya poora invite link — sab chalega. */
export async function parseRoomSyncPacketText(text: string): Promise<RoomSyncPacket | null> {
  const raw = (text ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      const direct = validatePacket(parsed)
      if (direct) return direct
      if (isRecord(parsed) && isRecord(parsed.state)) return packetFromState(parsed.state as unknown as AppState)
      if (isRecord(parsed) && parsed.room) return packetFromState(parsed as unknown as AppState)
      return null
    } catch {
      return null
    }
  }
  return decodeRoomSyncPacket(raw)
}

export function buildJoinLink(encodedPacket: string, origin?: string): string {
  const base = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '')
  return `${base}/join#packet=${encodedPacket}`
}

function mergeDefined<T extends object>(base: T, incoming: T): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[], merge: (cur: T, inc: T) => T): T[] {
  const map = new Map<string, T>()
  for (const item of current) map.set(item.id, item)
  for (const item of incoming) {
    const cur = map.get(item.id)
    map.set(item.id, cur ? merge(cur, item) : item)
  }
  return [...map.values()]
}

/**
 * Dusre member ke phone se aaya packet current room me merge karo.
 * Same room ho to IDs ke hisaab se naya data judta hai; alag room ho
 * to packet wala room load hota hai (UI pehle confirm karwati hai).
 */
export function mergeRoomSyncPacket(current: AppState, packet: RoomSyncPacket): AppState {
  const sameRoom = !!current.room && (current.room.id === packet.room.id || current.room.code === packet.room.code)
  if (!sameRoom) {
    return {
      ...current,
      room: packet.room,
      members: packet.members,
      expenses: [...packet.expenses].sort((a, b) => b.createdAt - a.createdAt),
      settlements: packet.settlements,
      recurring: packet.recurring,
      rules: packet.rules,
      merchants: packet.merchants,
      inbox: [],
      profile: { ...current.profile, memberId: undefined, onboarded: true },
    }
  }

  const room = (packet.room.updatedAt ?? 0) >= (current.room?.updatedAt ?? 0)
    ? mergeDefined(current.room as Room, packet.room)
    : current.room as Room
  const members = mergeById(current.members, packet.members, (cur, inc) => mergeDefined(cur, inc))
  const expenses = mergeById(current.expenses, packet.expenses, (cur, inc) => {
    const incomingNewer = inc.version > cur.version || (inc.version === cur.version && inc.updatedAt > cur.updatedAt)
    if (!incomingNewer) return cur
    return { ...inc, photoUrl: inc.photoUrl ?? cur.photoUrl, rawText: inc.rawText ?? cur.rawText }
  }).sort((a, b) => b.createdAt - a.createdAt)
  const settlements = mergeById(current.settlements, packet.settlements, (cur, inc) => ({
    ...mergeDefined(cur, inc),
    confirmedBy: [...new Set([...cur.confirmedBy, ...inc.confirmedBy])],
  }))
  const recurring = mergeById(current.recurring, packet.recurring, (cur, inc) => mergeDefined(cur, inc))
  const rules = mergeById(current.rules, packet.rules, (cur, inc) => mergeDefined(cur, inc))
  const merchantMap = new Map<string, MerchantMemory>()
  for (const m of current.merchants) merchantMap.set(m.key, m)
  for (const m of packet.merchants) {
    const cur = merchantMap.get(m.key)
    merchantMap.set(m.key, cur ? { ...mergeDefined(cur, m), hits: Math.max(cur.hits, m.hits) } : m)
  }

  const profileMemberExists = !!current.profile.memberId && members.some((m) => m.id === current.profile.memberId)
  return {
    ...current,
    room,
    members,
    expenses,
    settlements,
    recurring,
    rules,
    merchants: [...merchantMap.values()],
    profile: profileMemberExists ? current.profile : { ...current.profile, memberId: members[0]?.id, name: members[0]?.name ?? current.profile.name },
  }
}
