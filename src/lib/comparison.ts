import type { Expense } from './types'

export type ComparePeriod = 'week' | 'month' | 'cycle' | 'custom'
export type CompareMetric = 'room' | 'share' | 'paid'
export interface TimeRange { start: number; end: number }
export interface PeriodComparison { current: TimeRange; previous: TimeRange; currentLabel: string; previousLabel: string }

const DAY = 24 * 60 * 60 * 1000
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const endOfDay = (date: Date) => startOfDay(date) + DAY - 1
const addDays = (time: number, days: number) => time + days * DAY

export function dateToInput(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function inputToStart(value: string): number | null {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day).getTime() : null
}

export function inputToEnd(value: string): number | null {
  const start = inputToStart(value)
  return start === null ? null : start + DAY - 1
}

export function comparisonRanges(
  mode: ComparePeriod,
  now = Date.now(),
  cycle: TimeRange = { start: startOfDay(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1)), end: endOfDay(new Date(now)) },
  custom?: TimeRange,
): PeriodComparison {
  const today = startOfDay(new Date(now))
  let start: number
  let end: number
  let label: string

  if (mode === 'week') {
    const date = new Date(today)
    const mondayOffset = (date.getDay() + 6) % 7
    start = addDays(today, -mondayOffset)
    end = Math.min(now, addDays(start, 7) - 1)
    label = 'This week'
  } else if (mode === 'month') {
    const date = new Date(now)
    start = new Date(date.getFullYear(), date.getMonth(), 1).getTime()
    end = Math.min(now, new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() - 1)
    label = 'This month'
  } else if (mode === 'custom' && custom && custom.end >= custom.start) {
    start = startOfDay(new Date(custom.start))
    end = endOfDay(new Date(custom.end))
    label = 'Selected dates'
  } else {
    start = startOfDay(new Date(cycle.start))
    end = Math.min(now, cycle.end)
    label = 'This cycle'
  }

  const duration = Math.max(1, end - start + 1)
  let previousStart: number
  let previousEnd: number
  let previousLabel: string
  if (mode === 'week') {
    previousStart = addDays(start, -7)
    previousEnd = previousStart + duration - 1
    previousLabel = 'Last week · same days'
  } else if (mode === 'month') {
    const currentDate = new Date(start)
    const priorMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1).getTime()
    const priorMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime() - 1
    previousStart = priorMonthStart
    previousEnd = Math.min(priorMonthEnd, priorMonthStart + duration - 1)
    previousLabel = 'Last month · same days'
  } else {
    previousStart = start - duration
    previousEnd = previousStart + duration - 1
    previousLabel = mode === 'custom' ? 'Previous matching dates' : 'Previous cycle · same days'
  }

  return {
    current: { start, end },
    previous: { start: previousStart, end: previousEnd },
    currentLabel: label,
    previousLabel,
  }
}

export function comparisonTotal(
  expenses: readonly Expense[],
  range: TimeRange,
  metric: CompareMetric,
  memberId?: string,
): number {
  return expenses.reduce((total, expense) => {
    if (expense.deleted || expense.status !== 'confirmed' || expense.createdAt < range.start || expense.createdAt > range.end) return total
    if (metric === 'room') return total + expense.amountPaise
    if (!memberId) return total
    if (metric === 'paid') return total + (expense.payerId === memberId ? expense.amountPaise : 0)
    return total + (expense.splits.find((split) => split.memberId === memberId)?.paise ?? 0)
  }, 0)
}
