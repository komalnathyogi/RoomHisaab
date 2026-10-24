import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { QRCodeCanvas } from 'qrcode.react'
import type { Debt } from '../lib/balances'
import type { Member, UpiApp } from '../lib/types'
import { formatINR, paiseToInputValue, parseRupeesToPaise } from '../lib/money'
import { buildUpiLaunchLink, buildUpiLink, buildWhatsAppLink, settleReminderMessage, UPI_APPS, upiQrPayload } from '../lib/upi'
import { useStore } from '../hooks/useStore'
import { clearDraft, loadDraft, saveDraft } from '../hooks/usePersistentDraft'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import clsx from 'clsx'

/*
 * ⭐ UPI QR PAYMENT SHEET
 * Bill/debt jitna hai, QR me exact utna hi amount encoded hota hai.
 * Dusra phone scan kare ya isi phone par button se payment app khule.
 */
export function PaySheet({ debt, members, open, onClose, onPaid }: {
  debt: Debt | null
  members: Member[]
  open: boolean
  onClose: () => void
  onPaid: (d: Debt) => void
}) {
  const { pushToast } = useStore()
  const [amount, setAmount] = useState('')
  const [app, setApp] = useState<UpiApp>('any')
  const [launchedAt, setLaunchedAt] = useState<number | null>(null)
  const [launchedPaise, setLaunchedPaise] = useState<number | null>(null)
  const [returnedFromApp, setReturnedFromApp] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const returnTimerRef = useRef<number | undefined>(undefined)

  const from = members.find((m) => m.id === debt?.fromId)
  const to = members.find((m) => m.id === debt?.toId)
  const entered = parseRupeesToPaise(amount)
  const paise = entered !== null && entered > 0 ? Math.min(entered, debt?.paise ?? entered) : (debt?.paise ?? 0)

  useEffect(() => {
    if (!open || !debt) return
    setLaunchedAt(null)
    setLaunchedPaise(null)
    setReturnedFromApp(false)
    const saved = loadDraft<{ amount: string; app: UpiApp } | null>(`pay.${debt.fromId}.${debt.toId}`, null)
    if (saved) {
      setAmount(saved.amount); setApp(saved.app)
    } else {
      setAmount(paiseToInputValue(debt.paise)); setApp(from?.preferredUpiApp ?? 'any')
    }
  }, [open, debt?.fromId, debt?.toId, debt?.paise]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !launchedAt) return
    const checkReturn = () => {
      const elapsed = Date.now() - launchedAt
      window.clearTimeout(returnTimerRef.current)
      if (elapsed >= 3500) {
        setReturnedFromApp(true)
      } else {
        returnTimerRef.current = window.setTimeout(() => {
          if (document.visibilityState === 'visible') setReturnedFromApp(true)
        }, 3600 - elapsed)
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') checkReturn() }
    window.addEventListener('focus', checkReturn)
    window.addEventListener('pageshow', checkReturn)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(returnTimerRef.current)
      window.removeEventListener('focus', checkReturn)
      window.removeEventListener('pageshow', checkReturn)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [open, launchedAt])

  function updateDraft(next: Partial<{ amount: string; app: UpiApp }>) {
    if (!debt) return
    saveDraft(`pay.${debt.fromId}.${debt.toId}`, { amount, app, ...next })
  }

  const payload = useMemo(() => {
    if (!debt || !to) return null
    return {
      payeeVpa: to.upiId,
      payeeName: to.fullName || to.name,
      amountPaise: paise,
      note: `RoomHisaab settle ${formatINR(paise)}`,
      ref: `RH-${debt.fromId.slice(-4)}${debt.toId.slice(-4)}-${paise}`,
    }
  }, [debt, to, paise])

  const qr = payload ? upiQrPayload(payload) : null
  const appLink = payload ? buildUpiLaunchLink({ ...payload, app }) : null
  const genericLink = payload ? buildUpiLink({ ...payload, app: 'any' }) : null
  const wa = from && to ? buildWhatsAppLink(from.phone, settleReminderMessage(from.name, to.name, paise, genericLink)) : '#'

  async function copyLink() {
    if (!genericLink) return
    try {
      await navigator.clipboard.writeText(genericLink)
      pushToast({ message: 'UPI payment link copied.', tone: 'ok' })
    } catch {
      pushToast({ message: genericLink, tone: 'warn' })
    }
  }

  async function sharePayment() {
    if (!genericLink || !from || !to) return
    const text = `${from.name} needs to pay ${to.name} ${formatINR(paise)}. UPI link: ${genericLink}`
    try {
      if (navigator.share) await navigator.share({ title: 'RoomHisaab payment', text })
      else await copyLink()
    } catch {
      /* user cancelled share */
    }
  }

  function downloadQR() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas || !to) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `roomhisaab-pay-${to.name}-${paise}.png`
    a.click()
    pushToast({ message: 'QR image downloaded.', tone: 'ok' })
  }

  function recordPaid(amountPaise = paise) {
    if (!debt) return
    clearDraft(`pay.${debt.fromId}.${debt.toId}`)
    onPaid({ ...debt, paise: amountPaise })
    onClose()
  }

  return (
    <AnimatePresence>
      {open && debt && from && to && (
        <motion.div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/55 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
          <motion.div role="dialog" aria-modal="true" aria-label="UPI QR payment"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full sm:max-w-[480px] max-h-[94dvh] overflow-y-auto scrollbar-thin rounded-t-[28px] sm:rounded-[28px] bg-surface-card shadow-lift3d border border-line-light"
>
            <div className="sticky top-0 z-10 bg-surface-card/95 backdrop-blur px-5 pt-4 pb-3 border-b border-line-light flex items-center gap-3">
              <span className="icon-tile h-11 w-11"><Icon name="qr" size={22} /></span>
              <div className="flex-1">
                <h2 className="text-[19px] leading-none">Pay with QR</h2>
                <p className="text-[12px] text-ink-soft mt-1">The exact amount is included in the QR.</p>
              </div>
              <button onClick={onClose} className="btn-ghost !px-2.5" aria-label="Close"><Icon name="x" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-card2 border border-line-light p-3.5">
                <Avatar name={from.name} color={from.color} size={42} />
                <Icon name="arrowRight" className="text-ink-faint" />
                <Avatar name={to.name} color={to.color} size={42} />
                <div className="min-w-[150px] flex-1">
                  <p className="font-semibold text-[14.5px] leading-snug">{from.name} → {to.name}</p>
                  <p className="text-[12px] leading-snug text-ink-soft break-all">{to.upiId ?? 'UPI ID missing'}</p>
                </div>
                <p className="num ml-auto font-display text-[20px] text-primary">{formatINR(paise)}</p>
              </div>

              {!qr ? (
                <div className="rounded-2xl border border-pending/35 bg-pending/10 p-4 text-center">
                  <Icon name="wallet" size={30} className="mx-auto text-pending" />
                  <p className="font-display font-bold mt-2">A UPI ID is required for {to.name}</p>
                  <p className="text-[13px] text-ink-soft mt-1">A valid UPI ID is required before a QR can be created.</p>
                  <Link to="/room/members" onClick={onClose} className="btn-primary w-full mt-3">Add the UPI ID in Members</Link>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <div ref={qrRef} className="qr-shell inline-grid place-items-center rounded-[24px] p-4">
                      <QRCodeCanvas value={qr} size={214} level="M" includeMargin bgColor="#FFFFFF" fgColor="#18172B" />
                    </div>
                    <p className="text-[13px] font-semibold mt-3">Scan with another phone</p>
                    <p className="text-[12px] text-ink-soft">Or open a payment app on this phone.</p>
                  </div>

                  <div>
                    <label className="label" htmlFor="pay-amount">Amount (partial payment allowed)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-display font-bold text-ink-soft">₹</span>
                      <input id="pay-amount" className="input num !pl-9 !text-[18px]" inputMode="decimal" value={amount}
                        onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); setAmount(v); updateDraft({ amount: v }) }} />
                    </div>
                    <p className="text-[11.5px] text-ink-soft mt-1.5">Total pending: {formatINR(debt.paise)}. The QR updates with the amount.</p>
                  </div>

                  <div>
                    <span className="label">Choose a payment app</span>
                    <div className="flex flex-wrap gap-2">
                      {UPI_APPS.map((a) => (
                        <button key={a.id} type="button" onClick={() => { setApp(a.id); updateDraft({ app: a.id }) }} title={a.hint}
                          className={app === a.id ? 'chip-on' : 'chip-off'} aria-pressed={app === a.id}>{a.label}</button>
                      ))}
                    </div>
                  </div>

                  {appLink && (
                    <a
                      href={appLink}
                      onClick={() => { setLaunchedAt(Date.now()); setLaunchedPaise(paise); setReturnedFromApp(false) }}
                      className="btn-primary w-full !py-3 !text-[16px]"
                    >
                      <Icon name="wallet" /> {app === 'any' ? 'Pay with UPI app' : `Pay with ${UPI_APPS.find((a) => a.id === app)?.label}`} · {formatINR(paise)}
                    </a>
                  )}

                  {launchedAt && (
                    returnedFromApp ? (
                      <div className="rounded-2xl border border-moneyin/35 bg-moneyin/10 p-4" role="status">
                        <p className="font-display font-bold">Welcome back — was {formatINR(launchedPaise ?? paise)} paid?</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">Record it now. The final balance updates after {to.name} confirms receipt.</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" className="btn-accent !py-2.5" onClick={() => recordPaid(launchedPaise ?? paise)}><Icon name="check" size={17} /> I paid — record now</button>
                          <button type="button" className="btn-outline !py-2.5" onClick={() => { setLaunchedAt(null); setLaunchedPaise(null); setReturnedFromApp(false) }}>Not paid</button>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-soft" role="status">
                        Payment app opened. Return here after paying and RoomHisaab will help you record it.
                      </p>
                    )
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={copyLink} className="btn-outline !px-2 !text-[12.5px]"><Icon name="copy" size={17} /> Link</button>
                    <button onClick={downloadQR} className="btn-outline !px-2 !text-[12.5px]"><Icon name="download" size={17} /> QR</button>
                    <button onClick={sharePayment} className="btn-outline !px-2 !text-[12.5px]"><Icon name="share" size={17} /> Share</button>
                  </div>
                  {from.phone && <a href={wa} target="_blank" rel="noreferrer" className="btn-outline w-full"><Icon name="phone" size={18} /> Send payment link on WhatsApp</a>}

                  <div className="rounded-2xl bg-primary/10 border border-primary/20 p-3.5 flex gap-2.5 text-[12.5px] text-ink-soft">
                    <Icon name="shield" className="text-primary shrink-0 mt-0.5" size={19} />
                    <p><b className="text-ink">Safe flow:</b> Check the name and amount in your UPI app. RoomHisaab never asks for a PIN and cannot verify the bank payment automatically.</p>
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 bg-surface-card/95 backdrop-blur border-t border-line-light px-5 py-3.5 flex gap-2" style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom,0px))' }}>
              <button className="btn-outline flex-1" onClick={onClose}>Close</button>
              <button className={clsx('flex-[1.4]', qr ? 'btn-accent' : 'btn-outline')} onClick={() => recordPaid(returnedFromApp ? (launchedPaise ?? paise) : paise)} aria-label={returnedFromApp ? 'Record this payment' : 'Payment completed — record it'}>
                <Icon name="check" /> {returnedFromApp ? 'Record payment' : 'Payment done'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
