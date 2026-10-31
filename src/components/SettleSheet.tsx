import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Debt } from '../lib/balances'
import type { Member, Settlement } from '../lib/types'
import { formatINR, paiseToInputValue, parseRupeesToPaise } from '../lib/money'
import { useStore } from '../hooks/useStore'
import { clearDraft, loadDraft, saveDraft } from '../hooks/usePersistentDraft'
import { Avatar } from './Avatar'
import clsx from 'clsx'

/** Cash settle flow — DONO confirm karein tabhi hisaab se katega (tamper-proof) */
export function SettleSheet({ debt, members, meId, open, onClose, initialMethod = 'cash' }: {
  debt: Debt | null; members: Member[]; meId?: string; open: boolean; onClose: () => void; initialMethod?: Settlement['method']
}) {
  const { settle, pushToast } = useStore()
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [method, setMethod] = useState<Settlement['method']>('cash')
  const [both, setBoth] = useState(true)

  useEffect(() => {
    if (!open) { savingRef.current = false; setSaving(false); return }
    if (!debt) return
    const saved = loadDraft<{ amount: string; method: Settlement['method']; both: boolean } | null>(
      `settle.${debt.fromId}.${debt.toId}`, null,
    )
    if (saved) {
      setAmount(saved.amount); setMethod(saved.method); setBoth(saved.both)
    } else {
      setAmount(paiseToInputValue(debt.paise)); setMethod(initialMethod); setBoth(initialMethod === 'cash')
    }
  }, [open, debt?.fromId, debt?.toId, debt?.paise, initialMethod]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateDraft(next: Partial<{ amount: string; method: Settlement['method']; both: boolean }>) {
    if (!debt) return
    saveDraft(`settle.${debt.fromId}.${debt.toId}`, { amount, method, both, ...next })
  }

  const from = members.find((m) => m.id === debt?.fromId)
  const to = members.find((m) => m.id === debt?.toId)
  const paise = parseRupeesToPaise(amount) ?? debt?.paise ?? 0

  function confirm() {
    if (savingRef.current || !debt || !from || !to) return
    if (paise <= 0) { pushToast({ message: 'Enter a valid amount.', tone: 'bad' }); return }
    savingRef.current = true
    setSaving(true)
    settle(debt.fromId, debt.toId, paise, method, both ? [from.id, to.id] : [meId ?? from.id])
    clearDraft(`settle.${debt.fromId}.${debt.toId}`)
    pushToast({
      message: both ? `${from.name} paid ${to.name} ${formatINR(paise)}.`
                    : `${from.name} marked this payment. ${to.name} must confirm it.`,
      tone: 'ok',
    })
    setAmount(''); onClose()
  }

  return (
    <AnimatePresence>
      {open && debt && from && to && (
        <motion.div className="fixed inset-0 z-[130] flex items-end md:items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
          <motion.div role="dialog" aria-modal="true" aria-label="Confirm payment"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full md:max-w-md rounded-t-3xl md:rounded-xl2 bg-surface-card text-ink shadow-lift3d border border-line-light p-5 space-y-4"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom,0px))' }}>
            <h2 className="text-[19px]">Confirm payment</h2>

            <div className="card p-4 flex items-center gap-3">
              <Avatar name={from.name} color={from.color} size={44} />
              <div className="flex-1 text-center">
                <p className="text-[12px] text-ink-soft uppercase tracking-wide font-semibold">pays</p>
                <p className="num text-[22px] text-overdue">{formatINR(paise)}</p>
              </div>
              <Avatar name={to.name} color={to.color} size={44} />
            </div>

            <div>
              <label className="label" htmlFor="settle-amt">Amount paid</label>
              <input id="settle-amt" className="input num !text-[20px]" inputMode="decimal"
                placeholder={paiseToInputValue(debt.paise)} value={amount}
                onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); setAmount(v); updateDraft({ amount: v }) }} />
              <p className="text-[12px] text-ink-soft mt-1">Full amount to pay: {formatINR(debt.paise)}. You may record a smaller part now.</p>
            </div>

            <div>
              <span className="label">Payment method</span>
              <div className="grid grid-cols-2 gap-2">
                {(['cash', 'upi'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => { setMethod(m); updateDraft({ method: m }) }}
                    className={clsx('rounded-xl border py-3 font-bold transition-all active:scale-95',
                      method === m ? 'border-primary bg-primary/10 text-primary' : 'border-line-light text-ink-soft')}>
                    {m === 'cash' ? 'Cash' : 'UPI'}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-[13.5px] text-ink-soft cursor-pointer">
              <input type="checkbox" checked={both} onChange={(e) => { setBoth(e.target.checked); updateDraft({ both: e.target.checked }) }}
                className="mt-0.5 h-5 w-5 rounded accent-primary" />
              <span><b className="text-ink">Both people confirmed</b> — for an offline handover.
              If unchecked, the other person must confirm later.</span>
            </label>

            <div className="flex gap-2 pt-1">
              <button className="btn-outline flex-1" onClick={onClose}>Cancel</button>
              <button className="btn-primary flex-[2]" onClick={confirm} disabled={saving}>{saving ? 'Saving payment…' : 'Save payment'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
