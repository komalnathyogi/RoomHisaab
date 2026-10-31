import type { Category } from './types'

export const CATEGORIES: Category[] = [
  { id: 'rent',         label: 'Rent',         hi: 'Kiraya',      icon: '🏠', color: '#5046C8' },
  { id: 'groceries',    label: 'Groceries',    hi: 'Rashan',      icon: '🛒', color: '#179A6B' },
  { id: 'electricity',  label: 'Electricity',  hi: 'Bijli',       icon: '⚡', color: '#D99A16' },
  { id: 'wifi',         label: 'WiFi',         hi: 'Internet',    icon: '📶', color: '#3E7CB1' },
  { id: 'food',         label: 'Food',         hi: 'Khana',       icon: '🍔', color: '#D9534F' },
  { id: 'transport',    label: 'Transport',    hi: 'Aana-jaana',  icon: '🛺', color: '#5B7FA6' },
  { id: 'maid',         label: 'Maid',         hi: 'Kaamwali',    icon: '🧹', color: '#C95D8A' },
  { id: 'gas',          label: 'Gas Cylinder', hi: 'Gas',         icon: '🔥', color: '#E07A1F' },
  { id: 'water',        label: 'Water',        hi: 'Paani',       icon: '💧', color: '#2A9DB8' },
  { id: 'subscription', label: 'Subscription', hi: 'Netflix etc', icon: '📺', color: '#7465A6' },
  { id: 'medicine',     label: 'Medicine',     hi: 'Dawai',       icon: '💊', color: '#248A7A' },
  { id: 'shopping',     label: 'Shopping',     hi: 'Kharidari',   icon: '🛍️', color: '#B0643A' },
  { id: 'other',        label: 'Other',        hi: 'Anya',        icon: '📦', color: '#64748B' },
]

export const CAT_MAP: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
export const catOf = (id: string) => CAT_MAP[id] ?? CAT_MAP.other

export const METHODS = [
  { id: 'cash', label: 'Cash', hi: 'Nakad',   icon: '💵', cls: 'bg-pending/15 text-pending border-pending/30' },
  { id: 'upi',  label: 'UPI',  hi: 'UPI',     icon: '📱', cls: 'bg-primary/12 text-primary border-primary/30' },
  { id: 'card', label: 'Card', hi: 'Card',    icon: '💳', cls: 'bg-ink/8 text-ink border-line-light' },
] as const

/** deterministic avatar colours — naam se hamesha same colour */
export const AVATAR_COLORS = [
  '#5046C8', '#9A5B00', '#6842C4', '#C81E3A', '#137A3F',
  '#1D5FBF', '#A61E63', '#0E7490', '#B42318', '#0B756A',
]

export function colorFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const SPLIT_MODES = [
  { id: 'equal',   label: 'Equal',        hi: 'Equal — everyone same' },
  { id: 'percent', label: 'By percent',   hi: 'By percent — 50 / 30 / 20' },
  { id: 'exact',   label: 'Exact amount', hi: 'Exact ₹ — type each share' },
  { id: 'subset',  label: 'Some members', hi: 'Only selected people' },
] as const

export const APP = {
  name: 'RoomHisaab',
  version: '7.2.3-rc.0',
  tagline: 'Shared room expenses, made simple.',
  tagline2: 'Automatic tracking. Clear balances.',
  maxMembers: 8,
  minMembers: 2,
  storageKey: 'roomhisaab.v1',
} as const
