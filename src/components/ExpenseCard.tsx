import { motion } from 'framer-motion'
import type { Expense, Member } from '../lib/types'
import { catOf } from '../lib/constants'
import { formatINR } from '../lib/money'
import { Avatar } from './Avatar'
import clsx from 'clsx'

const REACTIONS = ['👀', '😂', '🙏', '🔥']

export function ExpenseCard({ e, members, index = 0, onEdit, onDelete, onReact, meId, canEdit = true }: {
  e: Expense; members: Member[]; index?: number
  onEdit?: (e: Expense) => void; onDelete?: (id: string) => void
  onReact?: (id: string, emoji: string) => void; meId?: string; canEdit?: boolean
}) {
  const cat = catOf(e.category)
  const payer = members.find((m) => m.id === e.payerId)
  const d = new Date(e.createdAt)
  const isAuto = e.source !== 'manual'
  const splitValues = e.splits.map((split) => split.paise)
  const nearlyEqualSplit = splitValues.length > 0 && Math.max(...splitValues) - Math.min(...splitValues) <= 1
  const splitSummary = splitValues.length === 0 ? '' : nearlyEqualSplit ? `${formatINR(splitValues[0])} each` : `${splitValues.length} shares`

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, height: 0 }}
      transition={{ duration: 0.24, delay: Math.min(index * 0.03, 0.24), ease: [0.4, 0, 0.2, 1] }}
      className="card p-3.5 group"
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center h-11 w-11 rounded-xl text-xl shrink-0"
          style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}33` }} aria-hidden="true">
          {cat.icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="min-w-0 max-w-full font-semibold text-[15px] leading-tight truncate">{e.description}</p>
            {isAuto && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 border border-primary/25 px-1.5 py-0.5 text-[10.5px] font-bold text-primary"
                title={e.source === 'quickbuy' ? 'Added from Quick Buy' : 'Auto-captured'}>{e.source === 'quickbuy' ? '🛒 QUICK BUY' : `✨ ${e.source.toUpperCase()}`}{e.confidence ? ` ${e.confidence}%` : ''}</span>
            )}
          </div>
          <p className="text-[12.5px] text-ink-soft mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{payer ? `Paid by ${payer.name}` : '—'}</span>
            <span aria-hidden="true">·</span>
            <span>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
            <span aria-hidden="true">·</span>
            <span className={clsx('rounded-md px-1.5 py-0.5 text-[10.5px] font-bold border',
              e.method === 'cash' ? 'border-pending/30 text-pending bg-pending/10'
              : e.method === 'upi' ? 'border-primary/30 text-primary bg-primary/10'
              : 'border-primary/30 text-primary bg-primary/10')}>
              {e.method === 'cash' ? '💵 CASH' : e.method === 'upi' ? '📱 UPI' : '💳 CARD'}
            </span>
            {e.splits.length > 0 && e.splits.length < members.filter((m) => !m.isVirtual).length && (
              <><span aria-hidden="true">·</span><span>{e.splits.length === 1 ? 'Only for 1 member' : `Split between ${e.splits.length} members`}</span></>
            )}
            {(e.vendorName || e.vendorUpiId) && (
              <><span aria-hidden="true">·</span><span className="truncate max-w-[220px]">{e.vendorName ?? e.vendorUpiId}</span></>
            )}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="num text-[17px]">{formatINR(e.amountPaise)}</p>
          <p className="num text-[11.5px] text-ink-soft">{splitSummary}</p>
        </div>
      </div>

      {e.photoUrl && (
        <img src={e.photoUrl} alt={`${e.description} bill`} loading="lazy" decoding="async"
          className="mt-3 h-24 w-full rounded-xl object-cover bg-black/5" />
      )}

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {REACTIONS.map((r) => {
          const who = e.reactions?.[r] ?? []
          return (
            <button key={r} onClick={() => onReact?.(e.id, r)} aria-label={`React ${r}`} aria-pressed={meId ? who.includes(meId) : false}
              className={clsx('h-10 min-h-[40px] min-w-[40px] rounded-full border px-2.5 text-[13px] transition-all active:scale-90',
                who.length ? 'border-primary/40 bg-primary/10' : 'border-line-light dark:border-line-dark [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:opacity-75 focus:opacity-100')}>
              {r}{who.length > 0 && <span className="ml-1 num text-[11px] font-bold text-primary">{who.length}</span>}
            </button>
          )
        })}
        <span className="flex-1" />
        {canEdit && onEdit && <button onClick={() => onEdit(e)} className="btn-ghost !px-3 !py-1.5 !min-h-[40px] text-[12.5px]">✏️ Edit</button>}
        {canEdit && onDelete && <button onClick={() => onDelete(e.id)} className="btn-ghost !px-3 !py-1.5 !min-h-[40px] min-w-[40px] text-[12.5px] text-overdue" aria-label={`Delete ${e.description}`}>🗑</button>}
        {!canEdit && (onEdit || onDelete) && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-faint" title="Only the payer can edit this entry">Owner only</span>}
      </div>
    </motion.li>
  )
}
