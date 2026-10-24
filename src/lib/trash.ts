import type { Expense } from './types'

const TRASH_KEY = 'roomhisaab.deletedExpenses.v1'
export const DELETED_EXPENSE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface DeletedExpenseRecord {
  expense: Expense
  deletedAt: number
}

export function loadDeletedExpenses(now = Date.now()): DeletedExpenseRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TRASH_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((record): record is DeletedExpenseRecord => {
      if (!record || typeof record !== 'object') return false
      const value = record as Partial<DeletedExpenseRecord>
      return Boolean(value.expense && typeof value.expense.id === 'string' && typeof value.expense.roomId === 'string'
        && typeof value.deletedAt === 'number' && now - value.deletedAt <= DELETED_EXPENSE_TTL_MS)
    }).slice(0, 100)
  } catch {
    return []
  }
}

export function saveDeletedExpenses(records: DeletedExpenseRecord[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(TRASH_KEY, JSON.stringify(records.slice(0, 100))) } catch { /* best effort on small device storage */ }
}
