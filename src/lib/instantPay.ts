import type { CategoryId, Method, Source, SplitMode } from './types'

const PENDING_INSTANT_PAY_KEY = 'roomhisaab.pendingInstantPay.v1'
export const INSTANT_PAY_TTL_MS = 30 * 60 * 1000
export const INSTANT_PAY_RETURN_DELAY_MS = 3500

export interface InstantPurchaseDraft {
  description: string
  amountPaise: number
  category: CategoryId
  payerId: string
  method: Method
  splitMode: SplitMode
  splits: { memberId: string; paise: number }[]
  note?: string
  vendorName?: string
  vendorUpiId?: string
  instantPay?: boolean
  source?: Source
  createdAt?: number
}

export interface InstantPurchaseIntent {
  version: 1
  id: string
  roomId: string
  startedAt: number
  autoAddOnReturn: boolean
  expense: InstantPurchaseDraft
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isIntent(value: unknown): value is InstantPurchaseIntent {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.expense)) return false
  const expense = value.expense
  return (
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.roomId === 'string' && value.roomId.length > 0 &&
    typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) &&
    typeof expense.description === 'string' && expense.description.trim().length > 0 &&
    typeof expense.amountPaise === 'number' && expense.amountPaise > 0 &&
    typeof expense.payerId === 'string' && expense.payerId.length > 0 &&
    Array.isArray(expense.splits) && expense.splits.length > 0
  )
}

export function savePendingInstantPurchase(intent: InstantPurchaseIntent): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(PENDING_INSTANT_PAY_KEY, JSON.stringify(intent))
    return window.localStorage.getItem(PENDING_INSTANT_PAY_KEY)?.includes(intent.id) === true
  } catch {
    return false
  }
}

export function loadPendingInstantPurchase(now = Date.now()): InstantPurchaseIntent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PENDING_INSTANT_PAY_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isIntent(parsed) || now - parsed.startedAt > INSTANT_PAY_TTL_MS || parsed.startedAt > now + 60_000) {
      clearPendingInstantPurchase()
      return null
    }
    return parsed
  } catch {
    clearPendingInstantPurchase()
    return null
  }
}

export function clearPendingInstantPurchase(expectedId?: string): void {
  if (typeof window === 'undefined') return
  try {
    if (expectedId) {
      const current = loadPendingInstantPurchase()
      if (current && current.id !== expectedId) return
    }
    window.localStorage.removeItem(PENDING_INSTANT_PAY_KEY)
  } catch {
    // Storage access can fail in restricted browser contexts.
  }
}

export function isInstantPayReturnReady(intent: InstantPurchaseIntent, now = Date.now()): boolean {
  const elapsed = now - intent.startedAt
  return elapsed >= INSTANT_PAY_RETURN_DELAY_MS && elapsed <= INSTANT_PAY_TTL_MS
}
