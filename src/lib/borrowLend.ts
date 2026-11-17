import type { RoomLoan } from './types'

export function outstandingLoanPaise(loan: Pick<RoomLoan, 'principalPaise' | 'repaidPaise'>): number {
  return Math.max(0, loan.principalPaise - loan.repaidPaise)
}

export function canReportRepayment(loan: Pick<RoomLoan, 'status' | 'principalPaise' | 'repaidPaise'>, amountPaise: number): boolean {
  return loan.status === 'active'
    && Number.isSafeInteger(amountPaise)
    && amountPaise > 0
    && amountPaise <= outstandingLoanPaise(loan)
}

export function resolveRepayment(loan: RoomLoan, decision: 'confirm' | 'decline', at = Date.now()): RoomLoan {
  if (loan.status !== 'repayment_pending' || loan.pendingRepaymentPaise <= 0) return loan
  const repaidPaise = decision === 'confirm' ? Math.min(loan.principalPaise, loan.repaidPaise + loan.pendingRepaymentPaise) : loan.repaidPaise
  return {
    ...loan,
    repaidPaise,
    pendingRepaymentPaise: 0,
    pendingRepaymentBy: undefined,
    status: decision === 'confirm' && repaidPaise >= loan.principalPaise ? 'repaid' : 'active',
    updatedAt: at,
  }
}
