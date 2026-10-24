// ─────────────────────────────────────────────────────────────
// ⭐ DEMO SEED — ek tap me bhara hua room.
// Khaali app doston ko dikhane se behtar hai bhari hui app dikhao.
// ─────────────────────────────────────────────────────────────
import type { AppState, Expense, Member, Settlement } from './types'
import { emptyState } from './storage'
import { colorFromName } from './constants'
import { splitEqual } from './money'
import { uid, roomCode } from './id'

const DAY = 24 * 3600 * 1000

function mkMember(name: string): Member {
  return { id: uid('m_'), name, color: colorFromName(name), joinedAt: Date.now() }
}

export function makeSeedRoom(names: string[] = ['Komal Nath', 'Anurag', 'Prabhat']): AppState {
  const base = emptyState()
  const members = names.slice(0, 8).map(mkMember)
  const [a, b, c] = members
  const room = { id: uid('r_'), name: `${a.name}'s Room`, code: roomCode(), rentCycleDay: 5, createdAt: Date.now() - 45 * DAY, demo: true }
  const now = Date.now()
  const currentRunKey = `${new Date(now).getFullYear()}-${new Date(now).getMonth()}`

  const mk = (
    daysAgo: number, description: string, amountRs: number, payer: Member,
    category: Expense['category'], method: Expense['method'], sharers: Member[],
    source: Expense['source'] = 'manual', confidence?: number,
  ): Expense => {
    const amountPaise = Math.round(amountRs * 100)
    const per = splitEqual(amountPaise, sharers.length)
    return {
      id: uid('e_'), roomId: room.id, description, amountPaise,
      payerId: payer.id, category, method, splitMode: 'equal',
      splits: sharers.map((m, i) => ({ memberId: m.id, paise: per[i] })),
      source, confidence, status: 'confirmed', reactions: {},
      createdAt: now - daysAgo * DAY, updatedAt: now - daysAgo * DAY, version: 1,
    }
  }

  // Admin-friendly one- and two-member demo spaces. They are sample-only
  // local state and never create cloud users or database rows.
  if (members.length < 3) {
    const sharers = members.filter((m) => !m.isVirtual)
    const sampleExpenses = members.length === 1
      ? [mk(2, 'Weekly vegetables', 620, a, 'groceries', 'upi', sharers), mk(1, 'Tea and snacks', 90, a, 'food', 'cash', sharers)]
      : [mk(2, 'Weekly vegetables', 620, a, 'groceries', 'upi', sharers), mk(1, 'Tea and snacks', 90, members[1], 'food', 'cash', sharers)]
    return {
      ...base,
      room,
      members,
      expenses: sampleExpenses,
      settlements: [],
      profile: { ...base.profile, name: a.name, onboarded: true },
      merchants: [], recurring: [], rules: [], inbox: [],
    }
  }

  const all = members
  const expenses: Expense[] = [
    mk(44, 'October Rent', 18000, a, 'rent', 'upi', all),
    mk(40, 'Electricity bill', 1240, b, 'electricity', 'upi', all),
    mk(37, 'WiFi — Airtel 30 days', 799, c, 'wifi', 'upi', all),
    mk(35, 'BigBasket weekly groceries', 2450.75, a, 'groceries', 'upi', all, 'sms', 96),
    mk(31, 'Swiggy — biryani night 🍗', 780, b, 'food', 'upi', [a, b], 'sms', 92),
    mk(29, 'Maid — half month', 1500, c, 'maid', 'cash', all),
    mk(26, 'Gas cylinder (Indane)', 912, a, 'gas', 'cash', all),
    mk(24, 'Zomato — late night maggi 😅', 340, b, 'food', 'upi', [b], 'sms', 88),
    mk(21, 'Rapido — metro station', 89, c, 'transport', 'upi', [c], 'sms', 85),
    mk(18, 'Blinkit — milk, bread, eggs', 512.5, a, 'groceries', 'upi', all, 'sms', 94),
    mk(15, 'Netflix split (3 month)', 599, b, 'subscription', 'card', all),
    mk(12, 'Apollo Pharmacy — medicine', 246, c, 'medicine', 'upi', [c]),
    mk(9,  'Weekly vegetables', 620, a, 'groceries', 'cash', all),
    mk(6,  'Swiggy — sunday feast', 1120, b, 'food', 'upi', all, 'sms', 97),
    mk(3,  'Uber — station drop', 340, c, 'transport', 'upi', [a, c]),
    mk(1,  'Tea and snacks', 90, a, 'food', 'cash', all),
  ]

  const settlements: Settlement[] = [
    {
      id: uid('s_'), roomId: room.id, fromId: b.id, toId: a.id, amountPaise: 50000,
      method: 'upi', confirmedBy: [a.id, b.id], note: 'Mid-month settle',
      createdAt: now - 20 * DAY,
    },
  ]

  return {
    ...base,
    room,
    members,
    expenses,
    settlements,
    profile: { ...base.profile, name: a.name, onboarded: true },
    merchants: [
      { key: 'BIGBASKET', displayName: 'BigBasket', defaultCategory: 'groceries', defaultSplitMode: 'equal', hits: 4 },
      { key: 'SWIGGY',    displayName: 'Swiggy',    defaultCategory: 'food',      defaultSplitMode: 'equal', hits: 6 },
      { key: 'ZOMATO',    displayName: 'Zomato',    defaultCategory: 'food',      defaultSplitMode: 'subset', hits: 2 },
    ],
    recurring: [
      { id: uid('rec_'), roomId: room.id, description: 'Rent', category: 'rent', amountPaise: 1800000, payerId: a.id, splitMode: 'equal', dayOfMonth: 5, method: 'upi', active: true, lastRunKey: currentRunKey },
      { id: uid('rec_'), roomId: room.id, description: 'WiFi — Airtel', category: 'wifi', amountPaise: 79900, payerId: c.id, splitMode: 'equal', dayOfMonth: 8, method: 'upi', active: true, lastRunKey: currentRunKey },
    ],
    rules: [
      { id: uid('rl_'), roomId: room.id, label: 'Zomato below ₹400 = selected members', when: { merchantContains: 'ZOMATO', amountBelowPaise: 40000 }, then: { category: 'food', splitMode: 'subset' }, active: true },
      { id: uid('rl_'), roomId: room.id, label: 'BigBasket = equal split', when: { merchantContains: 'BIGBASKET' }, then: { category: 'groceries', splitMode: 'equal' }, active: true },
    ],
    inbox: [],
  }
}
