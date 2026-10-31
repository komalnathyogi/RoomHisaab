// ─────────────────────────────────────────────────────────────
// RoomHisaab — central type definitions
// NOTE: har amount "paise" me integer hai (₹450.50 = 45050).
// Float kabhi use nahi karenge — warna 333.33 wala rounding bug aayega.
// ─────────────────────────────────────────────────────────────

export type CategoryId =
  | 'rent' | 'groceries' | 'electricity' | 'wifi' | 'food'
  | 'transport' | 'maid' | 'gas' | 'water' | 'subscription'
  | 'medicine' | 'shopping' | 'other'

export type Method = 'cash' | 'upi' | 'card'
export type SplitMode = 'equal' | 'percent' | 'exact' | 'subset'
export type Source = 'manual' | 'sms' | 'ocr' | 'voice' | 'rule' | 'recurring' | 'quickbuy'
export type ExpenseStatus = 'confirmed' | 'pending' | 'ignored'
export type UpiApp = 'any' | 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'navi'

export interface Category {
  id: CategoryId
  label: string
  hi: string
  icon: string
  color: string
}

export interface Member {
  id: string
  name: string
  fullName?: string
  color: string              // deterministic avatar colour
  upiId?: string             // UPI QR/deep-link ke liye
  phone?: string             // WhatsApp reminder ke liye
  email?: string
  preferredUpiApp?: UpiApp
  quickOpenUpi?: boolean
  defaultSharePercent?: number // optional fixed room-share preference
  monthlyBudgetPaise?: number
  city?: string
  notes?: string
  isVirtual?: boolean        // landlord / maid / wifi provider
  role?: 'owner' | 'admin' | 'member'
  joinedVia?: 'creator' | 'invite' | 'manual' | 'import' | 'demo'
  lastActiveAt?: number
  joinedAt: number
  // Cloud identity (Supabase). userId present = claimed/login-ready member.
  userId?: string | null
  loginUsername?: string
  claimed?: boolean
  cloudStatus?: 'active' | 'invited' | 'left' | 'removed'
}

export interface SplitEntry {
  memberId: string
  paise: number
}

export interface Expense {
  id: string
  roomId: string
  description: string
  category: CategoryId
  amountPaise: number
  payerId: string
  createdByUserId?: string   // cloud audit; edit permission payer-owner se decide hoti hai
  method: Method
  splitMode: SplitMode
  splits: SplitEntry[]
  photoUrl?: string
  note?: string
  vendorName?: string          // Quick Buy me shop/person jisko pay kiya
  vendorUpiId?: string         // shop/person VPA (agar entered/scan hua ho)
  instantPay?: boolean         // Quick Buy se turant pay karke save hua
  source: Source
  confidence?: number        // 0-100, auto-captured items ke liye
  status: ExpenseStatus
  rawText?: string           // SMS/OCR ka original text (proof)
  reactions: Record<string, string[]>  // emoji -> memberIds
  createdAt: number
  updatedAt: number
  version: number            // offline conflict resolution
  deleted?: boolean
}

export interface Settlement {
  id: string
  roomId: string
  fromId: string
  toId: string
  amountPaise: number
  method: Method
  confirmedBy: string[]      // dono confirm karein tabhi final
  note?: string
  createdAt: number
}

export interface Recurring {
  id: string
  roomId: string
  description: string
  category: CategoryId
  amountPaise: number
  payerId: string
  splitMode: SplitMode
  dayOfMonth: number         // 1-28
  method: Method
  active: boolean
  lastRunKey?: string        // "2026-10" — duplicate rokne ke liye
}

export interface Rule {
  id: string
  roomId: string
  label: string
  when: { merchantContains?: string; amountBelowPaise?: number; category?: CategoryId }
  then: { category?: CategoryId; splitMode?: SplitMode; payerId?: string; personalOf?: string }
  active: boolean
}

export interface MerchantMemory {
  key: string                // normalised merchant name
  displayName: string
  defaultCategory?: CategoryId
  defaultSplitMode?: SplitMode
  defaultPayerId?: string
  hits: number
}

export interface Room {
  id: string
  name: string
  code: string               // short invite/room identification code
  loginId?: string           // cloud Room Login ID (members login screen me use karte hain)
  cloud?: boolean            // true = Supabase room, server RLS active
  demo?: boolean             // sample-only room; never a real login or cloud account
  mode?: 'personal' | 'shared'
  demoMembers?: string[]      // disposable sample-session setup; never cloud identities
  demoSampleExpenses?: boolean
  demoSeed?: number
  rentCycleDay: number       // 1-28, monthly mode me hisaab ka month isi se chalega
  cycleMode?: 'monthly' | 'custom'
  cycleStart?: number        // custom cycle start timestamp
  cycleEnd?: number          // custom cycle end timestamp (inclusive)
  createdAt: number
  updatedAt?: number
}

export interface Profile {
  id: string
  memberId?: string          // is device par kaun active member hai
  name: string
  theme: 'light' | 'dark' | 'system'
  language: 'en' | 'hi'
  reduceMotion: boolean
  onboarded: boolean
}

export interface InboxItem {
  id: string
  rawText: string
  parsed: ParsedTransaction | null
  confidence: number
  source: Source
  createdAt: number
  status: 'new' | 'confirmed' | 'ignored'
  expenseId?: string
}

export interface ParsedTransaction {
  amountPaise: number
  direction: 'debit' | 'credit'
  merchant: string
  merchantKey: string
  bank: string
  date: number | null
  txnRef?: string
  methodGuess: Method
  confidence: number              // 0-100 — parser kitna sure hai
  suggestedCategory?: CategoryId  // merchant se guess ki hui category
  payerId?: string               // voice/share input me pehchana gaya payer
}

export interface AppState {
  version: number
  room: Room | null
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  recurring: Recurring[]
  rules: Rule[]
  merchants: MerchantMemory[]
  inbox: InboxItem[]
  profile: Profile
}
