// Repeatable, sample-only demo data. A seed makes a demo reproducible for tests and reset.
import type { AppState, CategoryId, Expense, Member, Method, Settlement } from './types'
import { emptyState } from './storage'
import { colorFromName } from './constants'
import { splitEqual } from './money'
import { uid, roomCode } from './id'

const DAY = 24 * 3600 * 1000
const NAME_POOL = ['Anurag', 'Komal', 'Prabhat', 'Aisha', 'Rohan', 'Meera', 'Kabir', 'Neha', 'Arjun', 'Tara']
const TEMPLATES: { description: string; category: CategoryId; min: number; max: number; method: Method }[] = [
  { description: 'Weekly groceries', category: 'groceries', min: 450, max: 2600, method: 'upi' },
  { description: 'Dinner and food', category: 'food', min: 250, max: 1250, method: 'cash' },
  { description: 'Monthly rent', category: 'rent', min: 5000, max: 18000, method: 'upi' },
  { description: 'WiFi bill', category: 'wifi', min: 699, max: 1199, method: 'upi' },
  { description: 'Electricity bill', category: 'electricity', min: 500, max: 1800, method: 'upi' },
  { description: 'Water bill', category: 'water', min: 180, max: 650, method: 'cash' },
  { description: 'Local travel', category: 'transport', min: 90, max: 520, method: 'upi' },
  { description: 'Household supplies', category: 'shopping', min: 200, max: 1400, method: 'card' },
  { description: 'Gas cylinder', category: 'gas', min: 850, max: 1150, method: 'upi' },
  { description: 'Shared subscription', category: 'subscription', min: 199, max: 999, method: 'card' },
  { description: 'Medicine', category: 'medicine', min: 120, max: 900, method: 'upi' },
  { description: 'Cleaning help', category: 'maid', min: 500, max: 1800, method: 'cash' },
]

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createDemoSeed(): number {
  try {
    const value = new Uint32Array(1)
    crypto.getRandomValues(value)
    return value[0] || 1
  } catch {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  }
}

export function demoMemberNames(count: number, seed: number): string[] {
  const size = Math.max(1, Math.min(10, Math.floor(count) || 3))
  const random = seededRandom(seed ^ 0x51ed270b)
  const names = [...NAME_POOL]
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  return names.slice(0, size)
}

function mkMember(name: string, joinedAt: number): Member {
  return { id: uid('m_'), name, color: colorFromName(name), joinedAt, joinedVia: 'demo', role: 'member' }
}

export interface DemoSeedOptions {
  roomName?: string
  mode?: 'personal' | 'shared'
  sampleExpenses?: boolean
  memberCount?: number
  seed?: number
}

export function makeSeedRoom(names?: string[], options: DemoSeedOptions = {}): AppState {
  const seed = options.seed ?? createDemoSeed()
  const random = seededRandom(seed)
  const requestedCount = options.memberCount ?? names?.length ?? (options.mode === 'personal' ? 1 : 3)
  const count = Math.max(1, Math.min(10, Math.floor(requestedCount) || 3))
  const safeNames = names?.map((name) => name.trim()).filter(Boolean)
  const generatedNames = demoMemberNames(count, seed)
  const chosenNames = (safeNames?.length ? safeNames : generatedNames).slice(0, count)
  while (chosenNames.length < count) {
    const next = generatedNames.find((name) => !chosenNames.includes(name)) ?? `Member ${chosenNames.length + 1}`
    chosenNames.push(next)
  }
  const uniqueNames = chosenNames.map((name, index) => chosenNames.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index ? name : generatedNames.find((candidate) => !chosenNames.some((other) => other.toLowerCase() === candidate.toLowerCase())) ?? `Member ${index + 1}`)
  const now = Date.now()
  const members = uniqueNames.map((name) => mkMember(name, now - 30 * DAY))
  const [first] = members
  const mode = count === 1 ? 'personal' : (options.mode ?? 'shared')
  const sampleExpenses = options.sampleExpenses ?? true
  const roomName = options.roomName?.trim() || (mode === 'personal' ? 'My Room' : 'Sample Room')
  const room = {
    id: uid('r_'), name: roomName, code: roomCode(), rentCycleDay: 1,
    createdAt: now - 60 * DAY, demo: true, mode,
    demoMembers: members.map((member) => member.name), demoSampleExpenses: sampleExpenses, demoSeed: seed,
  }
  const mk = (description: string, category: CategoryId, amountRs: number, payer: Member, sharers: Member[], daysAgo: number, method: Method, pending = false): Expense => {
    const amountPaise = Math.round(amountRs * 100)
    const splits = splitEqual(amountPaise, sharers.length).map((paise, index) => ({ memberId: sharers[index].id, paise }))
    return {
      id: uid('e_'), roomId: room.id, description, amountPaise, payerId: payer.id,
      category, method, splitMode: 'equal', splits, source: 'manual',
      status: pending ? 'pending' : 'confirmed', reactions: {},
      createdAt: now - daysAgo * DAY, updatedAt: now - daysAgo * DAY, version: 1,
    }
  }
  const expenses: Expense[] = []
  if (sampleExpenses) {
    const expenseCount = count === 1 ? 7 : Math.min(16, 9 + count)
    for (let i = 0; i < expenseCount; i++) {
      const template = TEMPLATES[Math.floor(random() * TEMPLATES.length)]
      const amount = template.min + Math.floor(random() * (template.max - template.min + 1))
      const payer = members[Math.floor(random() * members.length)]
      const daysAgo = Math.floor(random() * 55)
      const isPersonalLine = count === 1 || (template.category === 'food' && random() < 0.25)
      const sharers = isPersonalLine ? [payer] : members
      expenses.push(mk(template.description, template.category, amount, payer, sharers, daysAgo, template.method, i === expenseCount - 1))
    }
  }
  const settlements: Settlement[] = count > 1 && sampleExpenses ? [{
    id: uid('s_'), roomId: room.id, fromId: members[1].id, toId: first.id,
    amountPaise: 25000, method: 'upi', confirmedBy: [first.id, members[1].id],
    note: 'Sample settlement', createdAt: now - 8 * DAY,
  }] : []
  const currentRunKey = `${new Date(now).getFullYear()}-${new Date(now).getMonth()}`
  const base = emptyState()
  return {
    ...base, room, members, expenses, settlements,
    profile: { ...base.profile, name: first.name, onboarded: true },
    merchants: sampleExpenses ? [
      { key: 'GROCERIES', displayName: 'Local market', defaultCategory: 'groceries', defaultSplitMode: 'equal', hits: 4 },
      { key: 'WIFI', displayName: 'Internet provider', defaultCategory: 'wifi', defaultSplitMode: 'equal', hits: 2 },
    ] : [],
    recurring: sampleExpenses ? [{
      id: uid('rec_'), roomId: room.id, description: mode === 'personal' ? 'WiFi bill' : 'Rent',
      category: mode === 'personal' ? 'wifi' : 'rent', amountPaise: mode === 'personal' ? 99900 : 1500000,
      payerId: first.id, splitMode: 'equal', dayOfMonth: 5, method: 'upi', active: true, lastRunKey: currentRunKey,
    }] : [],
    rules: [], inbox: [],
  }
}
