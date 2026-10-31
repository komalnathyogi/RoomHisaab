// ─────────────────────────────────────────────────────────────
// BALANCE ENGINE
// 1) netBalance  — kis ko kitna milna hai / dena hai
// 2) simplifyDebts — "Amit → Komal owes ₹450" wali list
// 3) minimalTransfers — kam se kam kitne payment me hisaab saaf
// ─────────────────────────────────────────────────────────────
import type { Expense, Member, Room, Settlement } from './types'
import { sumPaise } from './money'

export interface Debt {
  fromId: string   // jisne dena hai
  toId: string     // jisne lena hai
  paise: number
}

export interface NetPosition {
  memberId: string
  netPaise: number     // + = isko milna hai, - = isko dena hai
  paidPaise: number    // total kharcha kiya
  owedPaise: number    // total share banta hai
}

/** sirf confirmed + not-deleted expenses lo */
function liveExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.deleted && e.status === 'confirmed')
}

/** har member ka net position — paid - owed (+ settlement effect) */
export function computeNet(expenses: Expense[], settlements: Settlement[], members: Member[]): NetPosition[] {
  const paid = new Map<string, number>()
  const owed = new Map<string, number>()
  const settle = new Map<string, number>()   // + = isne chukaya, - = isne receive kiya
  for (const m of members) { paid.set(m.id, 0); owed.set(m.id, 0); settle.set(m.id, 0) }
  const add = (map: Map<string, number>, id: string, v: number) => map.set(id, (map.get(id) ?? 0) + v)

  for (const e of liveExpenses(expenses)) {
    add(paid, e.payerId, e.amountPaise)
    for (const s of e.splits) add(owed, s.memberId, s.paise)
  }
  for (const s of settlements) {
    if (s.confirmedBy.length < 2) continue          // ek-tarfa confirm count nahi hoga (tamper-proof)
    add(settle, s.fromId, s.amountPaise)            // dene wale ka udhaar kam
    add(settle, s.toId, -s.amountPaise)             // lene wale ka credit kam
  }

  return members.map((m) => {
    const p = paid.get(m.id) ?? 0
    const o = owed.get(m.id) ?? 0
    const st = settle.get(m.id) ?? 0
    return { memberId: m.id, paidPaise: p, owedPaise: o, netPaise: p - o + st }
  })
}

/**
 * ⭐ MINIMAL TRANSFERS (greedy graph simplification)
 * 4 log, 6 udhaar → 2-3 payment me saaf. Splitwise wali trick.
 */
export function minimalTransfers(positions: NetPosition[]): Debt[] {
  const creditors = positions.filter((p) => p.netPaise > 0).map((p) => ({ id: p.memberId, amt: p.netPaise }))
  const debtors = positions.filter((p) => p.netPaise < 0).map((p) => ({ id: p.memberId, amt: -p.netPaise }))
  creditors.sort((a, b) => b.amt - a.amt)
  debtors.sort((a, b) => b.amt - a.amt)

  const out: Debt[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j]
    const amt = Math.min(d.amt, c.amt)
    if (amt > 0) out.push({ fromId: d.id, toId: c.id, paise: amt })
    d.amt -= amt
    c.amt -= amt
    if (d.amt === 0) i++
    if (c.amt === 0) j++
  }
  return out.sort((a, b) => b.paise - a.paise)
}

/** simplified debt list — UI ke liye ("Amit → Komal owes ₹450") */
export function simplifyDebts(expenses: Expense[], settlements: Settlement[], members: Member[]): Debt[] {
  return minimalTransfers(computeNet(expenses, settlements, members))
}

/** room poori tarah barabar hai? (confetti trigger) */
export function isFullySettled(expenses: Expense[], settlements: Settlement[], members: Member[]): boolean {
  if (liveExpenses(expenses).length === 0) return false
  return simplifyDebts(expenses, settlements, members).length === 0
}

export function totalSpent(expenses: Expense[], fromTs?: number, toTs?: number): number {
  return sumPaise(
    liveExpenses(expenses)
      .filter((e) => (fromTs === undefined || e.createdAt >= fromTs) && (toTs === undefined || e.createdAt <= toTs))
      .map((e) => e.amountPaise),
  )
}

/** category-wise total (donut chart ke liye) */
export function byCategory(expenses: Expense[], fromTs?: number, toTs?: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of liveExpenses(expenses)) {
    if (fromTs !== undefined && e.createdAt < fromTs) continue
    if (toTs !== undefined && e.createdAt > toTs) continue
    out[e.category] = (out[e.category] ?? 0) + e.amountPaise
  }
  return out
}

/** method-wise total (cash vs UPI ratio) */
export function byMethod(expenses: Expense[], fromTs?: number, toTs?: number): Record<string, number> {
  const out: Record<string, number> = { cash: 0, upi: 0, card: 0 }
  for (const e of liveExpenses(expenses)) {
    if (fromTs !== undefined && e.createdAt < fromTs) continue
    if (toTs !== undefined && e.createdAt > toTs) continue
    out[e.method] = (out[e.method] ?? 0) + e.amountPaise
  }
  return out
}

/** week-by-week bars — rent cycle ke hisaab se 4-5 week */
export function byWeek(expenses: Expense[], cycleStart: number): { label: string; paise: number }[] {
  const weeks = Array.from({ length: 5 }, (_, i) => ({ label: `W${i + 1}`, paise: 0 }))
  for (const e of liveExpenses(expenses)) {
    if (e.createdAt < cycleStart) continue
    const idx = Math.floor((e.createdAt - cycleStart) / (7 * 24 * 3600 * 1000))
    if (idx >= 0 && idx < weeks.length) weeks[idx].paise += e.amountPaise
  }
  return weeks
}

/**
 * Rent-cycle month range.
 * Indian rooms ka hisaab 1 taareekh se nahi, rent date se chalta hai (jaise 5th → 5th).
 */
export function cycleRange(rentCycleDay: number, now = new Date()): { start: number; end: number; label: string } {
  const day = Math.min(Math.max(rentCycleDay || 1, 1), 28)
  let start = new Date(now.getFullYear(), now.getMonth(), day, 0, 0, 0, 0)
  if (now.getTime() < start.getTime()) start = new Date(now.getFullYear(), now.getMonth() - 1, day, 0, 0, 0, 0)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day, 0, 0, 0, 0)
  const label = start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  return { start: start.getTime(), end: end.getTime() - 1, label }
}

/** Room ke saved setting se cycle nikalo — monthly fixed-date ya custom start/end. */
export function cycleRangeForRoom(room?: Pick<Room, 'rentCycleDay' | 'cycleMode' | 'cycleStart' | 'cycleEnd'> | null, now = new Date()): { start: number; end: number; label: string; mode: 'monthly' | 'custom' } {
  if (room?.cycleMode === 'custom' && room.cycleStart && room.cycleEnd && room.cycleEnd >= room.cycleStart) {
    const s = new Date(room.cycleStart)
    const e = new Date(room.cycleEnd)
    const label = `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    return { start: room.cycleStart, end: room.cycleEnd, label, mode: 'custom' }
  }
  return { ...cycleRange(room?.rentCycleDay ?? 1, now), mode: 'monthly' }
}

export function cycleLabelForRoom(room?: Pick<Room, 'rentCycleDay' | 'cycleMode' | 'cycleStart' | 'cycleEnd'> | null): string {
  const c = cycleRangeForRoom(room)
  return c.mode === 'custom' ? c.label : `Cycle starts on day ${room?.rentCycleDay ?? 1}`
}
