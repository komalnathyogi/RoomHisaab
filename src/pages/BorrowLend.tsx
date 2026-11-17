import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { useRoomData, useStore } from '../hooks/useStore'
import { formatINR, parseRupeesToPaise } from '../lib/money'
import { outstandingLoanPaise } from '../lib/borrowLend'
import type { BorrowRequest, LoanEvent, RoomLoan } from '../lib/types'
import clsx from 'clsx'

const statusLabel: Record<RoomLoan['status'], string> = {
  awaiting_borrower_ack: 'Waiting for borrower to confirm receipt',
  awaiting_lender_ack: 'Waiting for lender to confirm the transfer',
  active: 'Active',
  repayment_pending: 'Repayment awaiting confirmation',
  repaid: 'Repaid in full',
  cancelled: 'Cancelled',
}
const eventLabel: Record<LoanEvent['kind'], string> = {
  request_approved: 'Request approved', request_declined: 'Request declined', funds_recorded: 'Loan amount recorded',
  receipt_confirmed: 'Borrower confirmed receipt', sent_confirmed: 'Lender confirmed money sent',
  repayment_reported: 'Repayment reported', repayment_confirmed: 'Repayment confirmed',
  repayment_declined: 'Repayment not confirmed', loan_cancelled: 'Loan cancelled',
}

export default function BorrowLend({ embedded = false }: { embedded?: boolean }) {
  const { state, requestBorrow, reviewBorrowRequest, cancelBorrowRequest, recordLoan, acknowledgeLoanFunds, reportLoanRepayment, reviewLoanRepayment, pushToast } = useStore()
  const { room, members, me } = useRoomData()
  const [flow, setFlow] = useState<'request' | 'record'>('request')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [direction, setDirection] = useState<'lend' | 'borrow'>('lend')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [repaymentDraft, setRepaymentDraft] = useState<Record<string, string>>({})
  const people = members.filter((member) => !member.isVirtual)
  const others = people.filter((member) => member.id !== me?.id)
  const requests = useMemo(() => [...state.borrowRequests].filter((request) => request.roomId === room?.id).sort((a,b) => b.createdAt-a.createdAt), [state.borrowRequests, room?.id])
  const loans = useMemo(() => [...state.loans].filter((loan) => loan.roomId === room?.id).sort((a,b) => b.updatedAt-a.updatedAt), [state.loans, room?.id])
  const eventsByLoan = useMemo(() => {
    const map = new Map<string, LoanEvent[]>()
    for (const event of state.loanEvents.filter((entry) => entry.roomId === room?.id)) map.set(event.loanId, [...(map.get(event.loanId) ?? []), event])
    return map
  }, [state.loanEvents, room?.id])

  if (!room || !me) return <EmptyState emoji="🤝" title="Create or open a room first" body="Borrow & Lend records are kept separately from room expenses." action={<Link to="/onboarding" className="btn-primary">Create a room</Link>} />

  function submit() {
    const paise = parseRupeesToPaise(amount)
    if (!counterpartyId || !paise || paise <= 0) { pushToast({ message: 'Choose a member and enter a valid amount.', tone: 'bad' }); return }
    if (flow === 'request') {
      if (!reason.trim()) { pushToast({ message: 'Add a short reason for the request.', tone: 'bad' }); return }
      requestBorrow(counterpartyId, paise, reason)
      pushToast({ message: 'Borrow request sent. It is not an expense or payment.', tone: 'ok' })
    } else {
      const lender = direction === 'lend' ? me.id : counterpartyId
      const borrower = direction === 'borrow' ? me.id : counterpartyId
      recordLoan(lender, borrower, paise, note)
      pushToast({ message: 'Loan record added. The other member must confirm the transfer.', tone: 'ok' })
    }
    setAmount(''); setReason(''); setNote('')
  }

  function createFromRequest(request: BorrowRequest) {
    if (state.loans.some((loan) => loan.requestId === request.id)) { pushToast({ message: 'A loan record already exists for this request.', tone: 'warn' }); return }
    const lenderId = request.counterpartyId
    const borrowerId = request.requesterId
    recordLoan(lenderId, borrowerId, request.amountPaise, request.reason, request.id)
    pushToast({ message: 'Transfer recorded. It will be active after the other member confirms.', tone: 'ok' })
  }

  const memberName = (id: string) => members.find((member) => member.id === id)?.name ?? 'Former member'
  const memberColor = (id: string) => members.find((member) => member.id === id)?.color ?? '#5046C8'

  return (
    <div className="space-y-5">
      {!embedded && <PageHead title="Borrowing" sub="Keep personal loans and repayments separate from shared room expenses." />}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex items-start gap-3"><span className="icon-tile h-11 w-11"><Icon name="shield" size={21}/></span><div><h2 className="font-display font-bold">Not part of expense totals or bill splits</h2><p className="mt-1 text-[13px] text-ink-soft">A request is not proof of a transfer. Both people confirm money sent or received. Repayments only reduce a loan after the lender confirms them. No UPI payment is launched from this page.</p></div></div>
      </div>

      {others.length === 0 ? (
        <EmptyState emoji="👥" title="Borrowing needs another member" body="Add a roommate to this room before creating a request or loan record. Your existing expense history will not change." action={<Link to="/room/members?add=1" className="btn-primary">Add a member</Link>} />
      ) : <SectionCard title="New record" sub="Choose a request or record a transfer that has already happened.">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Borrow or lend flow">
          <button type="button" role="tab" aria-selected={flow==='request'} onClick={()=>setFlow('request')} className={clsx('min-h-11 rounded-xl border px-3 font-semibold', flow==='request'?'border-primary bg-primary/10 text-primary':'border-line-light')}>Request approval</button>
          <button type="button" role="tab" aria-selected={flow==='record'} onClick={()=>setFlow('record')} className={clsx('min-h-11 rounded-xl border px-3 font-semibold', flow==='record'?'border-primary bg-primary/10 text-primary':'border-line-light')}>Record a transfer</button>
        </div>
        {flow === 'record' && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" aria-pressed={direction==='lend'} onClick={()=>setDirection('lend')} className={clsx('rounded-xl border p-3 text-left',direction==='lend'?'border-primary bg-primary/10':'border-line-light')}><b>I lent money</b><span className="block text-[12px] text-ink-soft">The other person confirms it.</span></button><button type="button" aria-pressed={direction==='borrow'} onClick={()=>setDirection('borrow')} className={clsx('rounded-xl border p-3 text-left',direction==='borrow'?'border-primary bg-primary/10':'border-line-light')}><b>I borrowed money</b><span className="block text-[12px] text-ink-soft">The lender confirms it.</span></button></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="borrow-member">{flow==='request'?'Ask':'Other member'}</label><select id="borrow-member" className="input" value={counterpartyId} onChange={(event)=>setCounterpartyId(event.target.value)}><option value="">Choose a member</option>{others.map((member)=><option value={member.id} key={member.id}>{member.name}</option>)}</select></div>
          <div><label className="label" htmlFor="borrow-amount">Amount (₹)</label><input id="borrow-amount" className="input" inputMode="decimal" type="number" min="0.01" step="0.01" max="1000000000" placeholder="0.00" value={amount} onChange={(event)=>setAmount(event.target.value)}/></div>
        </div>
        {flow==='request' ? <div className="mt-3"><label className="label" htmlFor="borrow-reason">Reason</label><input id="borrow-reason" className="input" maxLength={200} placeholder="For example, electricity bill" value={reason} onChange={(event)=>setReason(event.target.value)}/></div> : <div className="mt-3"><label className="label" htmlFor="borrow-note">Note (optional)</label><input id="borrow-note" className="input" maxLength={200} placeholder="Optional details" value={note} onChange={(event)=>setNote(event.target.value)}/></div>}
        <button type="button" onClick={submit} className="btn-primary mt-4"><Icon name={flow==='request'?'share':'check'} size={17}/>{flow==='request'?'Send request':'Record transfer'}</button>
      </SectionCard>}

      <SectionCard title="Requests" sub="Approve or decline requests made to you. Approval does not record a payment.">
        {requests.length ? <div className="space-y-3">{requests.map((request)=>{
          const incoming = request.counterpartyId === me.id
          const canReview = incoming && request.status==='requested'
          const linkedLoan = state.loans.find((loan)=>loan.requestId===request.id)
          return <article key={request.id} className="rounded-2xl border border-line-light bg-surface-alt p-4">
            <div className="flex items-start gap-3"><Avatar name={memberName(incoming?request.requesterId:request.counterpartyId)} color={memberColor(incoming?request.requesterId:request.counterpartyId)} size={40}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-bold">{incoming?`${memberName(request.requesterId)} asked to borrow`:`You asked ${memberName(request.counterpartyId)}`}</h3><span className="rounded-full bg-surface-card px-2.5 py-1 text-[11px] font-bold capitalize">{request.status}</span></div><p className="mt-1 text-[13px] text-ink-soft">{request.reason} · {new Date(request.createdAt).toLocaleDateString('en-IN')}</p><p className="mt-2 font-display text-[21px] font-bold">{formatINR(request.amountPaise)}</p></div></div>
            {canReview && <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-primary !px-3" onClick={()=>reviewBorrowRequest(request.id,'approved')}>Approve</button><button type="button" className="btn-outline !px-3" onClick={()=>reviewBorrowRequest(request.id,'declined')}>Decline</button></div>}
            {!incoming && request.status==='requested' && <button type="button" className="btn-ghost mt-2 !px-2" onClick={()=>cancelBorrowRequest(request.id)}>Cancel request</button>}
            {request.status==='approved' && !linkedLoan && <button type="button" className="btn-outline mt-3 !px-3" onClick={()=>createFromRequest(request)}>Record the transfer</button>}
            {linkedLoan && <p className="mt-2 text-[12px] text-ink-soft">Transfer linked to {statusLabel[linkedLoan.status].toLowerCase()}.</p>}
          </article>
        })}</div> : <p className="rounded-xl bg-surface-alt p-4 text-[13px] text-ink-soft">No borrowing requests yet.</p>}
      </SectionCard>

      <SectionCard title="Loans and repayment history" sub="Pending amounts stay separate from shared room balances.">
        {loans.length ? <div className="space-y-3">{loans.map((loan)=>{
          const isBorrower=loan.borrowerId===me.id, isLender=loan.lenderId===me.id, outstanding=outstandingLoanPaise(loan)
          const history=(eventsByLoan.get(loan.id)??[]).slice().sort((a,b)=>a.createdAt-b.createdAt)
          return <article key={loan.id} className="rounded-2xl border border-line-light bg-surface-alt p-4">
            <div className="flex flex-wrap items-start gap-3"><Avatar name={memberName(isBorrower?loan.lenderId:loan.borrowerId)} color={memberColor(isBorrower?loan.lenderId:loan.borrowerId)} size={40}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-bold">{isBorrower?`Borrowed from ${memberName(loan.lenderId)}`:`Lent to ${memberName(loan.borrowerId)}`}</h3><span className="rounded-full bg-surface-card px-2.5 py-1 text-[11px] font-bold">{statusLabel[loan.status]}</span></div><p className="mt-1 text-[12px] text-ink-soft">{loan.note||'No note'} · Started {new Date(loan.createdAt).toLocaleDateString('en-IN')}</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><Amount label="Principal" value={loan.principalPaise}/><Amount label="Repaid" value={loan.repaidPaise}/><Amount label="Outstanding" value={outstanding}/></div>
              {loan.status==='repayment_pending' && <p className="mt-3 rounded-xl border border-pending/30 bg-pending/10 p-3 text-[12px]">{isLender?`${memberName(loan.borrowerId)} reports ${formatINR(loan.pendingRepaymentPaise)} repaid. Check your records before confirming.`:'Your repayment report is waiting for the lender to confirm.'}</p>}
              {isBorrower && loan.status==='awaiting_borrower_ack' && <button type="button" className="btn-primary mt-3 !px-3" onClick={()=>acknowledgeLoanFunds(loan.id)}>I confirm I received it</button>}
              {isLender && loan.status==='awaiting_lender_ack' && <button type="button" className="btn-primary mt-3 !px-3" onClick={()=>acknowledgeLoanFunds(loan.id)}>I confirm I sent it</button>}
              {isLender && loan.status==='repayment_pending' && <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-primary !px-3" onClick={()=>reviewLoanRepayment(loan.id,'confirm')}>Confirm repayment</button><button type="button" className="btn-outline !px-3" onClick={()=>reviewLoanRepayment(loan.id,'decline')}>Not received</button></div>}
              {isBorrower && loan.status==='active' && <div className="mt-3 flex flex-wrap items-end gap-2"><div><label className="label" htmlFor={`repay-${loan.id}`}>Report repayment (₹)</label><input id={`repay-${loan.id}`} className="input w-40" type="number" min="0.01" step="0.01" max={outstanding/100} value={repaymentDraft[loan.id]??''} onChange={(event)=>setRepaymentDraft((current)=>({...current,[loan.id]:event.target.value}))}/></div><button type="button" className="btn-outline !px-3" onClick={()=>{const paise=parseRupeesToPaise(repaymentDraft[loan.id]??'');if(!paise||paise>outstanding){pushToast({message:'Enter an amount up to the outstanding balance.',tone:'bad'});return} reportLoanRepayment(loan.id,paise);setRepaymentDraft((current)=>({...current,[loan.id]:''}))}}>Report repayment</button></div>}
            </div></div>
            {history.length>0 && <details className="mt-3"><summary className="cursor-pointer text-[12px] font-semibold text-primary">Activity history ({history.length})</summary><ol className="mt-2 space-y-2 border-l-2 border-primary/20 pl-4">{history.map((event)=><li key={event.id} className="text-[12px] text-ink-soft"><b className="text-ink">{eventLabel[event.kind]}</b>{event.amountPaise?` · ${formatINR(event.amountPaise)}`:''} · {memberName(event.actorId)} · {new Date(event.createdAt).toLocaleString('en-IN')}</li>)}</ol></details>}
          </article>
        })}</div> : <p className="rounded-xl bg-surface-alt p-4 text-[13px] text-ink-soft">No loans recorded. Record money only after both people agree that a transfer happened.</p>}
      </SectionCard>
    </div>
  )
}

function Amount({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-line-light bg-surface-card p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">{label}</p><p className="mt-1 font-display font-bold">{formatINR(value)}</p></div>}
