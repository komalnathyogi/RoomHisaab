import type { Expense, Member } from './types'

/**
 * Deterministic member order.
 * Balance/profile/cloud refresh must never move member rows up or down.
 * Members stay in join order; when several members were created in the
 * same instant, preserve their original add-order instead of shuffling
 * them by a random ID.
 */
export function stableMembers(members: readonly Member[]): Member[] {
  return members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => {
      const byJoin = (a.member.joinedAt || 0) - (b.member.joinedAt || 0)
      if (byJoin !== 0) return byJoin
      return a.index - b.index
    })
    .map(({ member }) => member)
}

/** Stable newest-first expense order, including equal timestamps. */
export function stableExpenses(expenses: readonly Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    const byDate = b.createdAt - a.createdAt
    if (byDate !== 0) return byDate
    const byUpdate = b.updatedAt - a.updatedAt
    if (byUpdate !== 0) return byUpdate
    return a.id.localeCompare(b.id)
  })
}
