import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { QRCodeCanvas } from 'qrcode.react'
import { useRoomData, useStore } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { simplifyDebts, type Debt } from '../lib/balances'
import { formatINR, parseRupeesToPaise } from '../lib/money'
import { buildUpiLaunchLink, buildUpiLink, UPI_APPS, upiQrPayload } from '../lib/upi'
import type { Member, UpiApp } from '../lib/types'
import { PageHead } from '../components/Layout'
import { DebtRow } from '../components/DebtRow'
import { PaySheet } from '../components/PaySheet'
import { SettleSheet } from '../components/SettleSheet'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import clsx from 'clsx'

function dateLabel(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function profileScore(m: Member) {
  const checks = [!!m.fullName, !!m.upiId, !!m.phone, !!m.email, !!m.preferredUpiApp && m.preferredUpiApp !== 'any']
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export default function Payments() {
  const { ready, pushToast, confirmSettlement, isCloudRoomActive } = useStore()
  const { room, members, expenses, settlements, me } = useRoomData()
  const [payDebt, setPayDebt] = useState<Debt | null>(null)
  const [settleDebt, setSettleDebt] = useState<Debt | null>(null)
  const [settleMethod, setSettleMethod] = usePersistentState<'cash' | 'upi'>('payments.settleMethod', 'cash')

  const debts = useMemo(() => simplifyDebts(expenses, settlements, members), [expenses, settlements, members])
  const totalPending = debts.reduce((s, d) => s + d.paise, 0)
  const myPayable = debts.filter((d) => d.fromId === me?.id).reduce((s, d) => s + d.paise, 0)
  const myReceivable = debts.filter((d) => d.toId === me?.id).reduce((s, d) => s + d.paise, 0)
  const realMembers = members.filter((m) => !m.isVirtual)
  const isSolo = realMembers.length === 1
  const missingUpi = members.filter((m) => !m.isVirtual && !m.upiId)
  const pendingConfirmations = settlements.filter((s) => !(s.confirmedBy.includes(s.fromId) && s.confirmedBy.includes(s.toId)))
  const recentSettlements = [...settlements].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)

  if (!ready) return <p className="text-ink-soft">Loading payments…</p>
  if (!room || members.length === 0) {
    return (
      <>
        <PageHead title="Payments" sub="First create a room and add members" />
        <EmptyState emoji="💳" title="Create a room first" body="Exact-amount QR payments will appear after members and UPI IDs are added." action={<Link to="/onboarding" className="btn-primary">Set up room</Link>} />
      </>
    )
  }

  return (
    <>
      <PageHead
        title={isSolo ? "Personal payments" : "Payments"}
        sub={isSolo ? "There are no members to settle with yet. You can add them later." : "Pay only money that is already pending between members"}
        right={isSolo ? <Link to="/room/buy" className="btn-primary"><Icon name="plus" size={18} /> Add personal expense</Link> : <Link to="/room/members" className="btn-outline"><Icon name="users" size={18} /> UPI profiles</Link>}
      />

      {/* KPI strip */}
      {isSolo ? <div className="card mb-5 flex flex-wrap items-center gap-3 p-4"><span className="icon-tile h-11 w-11"><Icon name="wallet" size={22} /></span><div><p className="font-display font-bold">Your personal expenses are not split</p><p className="text-[12.5px] text-ink-soft">You are responsible for 100% of each personal expense. Add people later if you begin sharing costs.</p></div></div> : <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5" aria-label="Payment summary">
        <Kpi icon="wallet" label="Total still pending" value={formatINR(totalPending)} sub={`${debts.length} transfer${debts.length === 1 ? '' : 's'}`} tone="primary" />
        <Kpi icon="arrowRight" label="You need to pay" value={formatINR(myPayable)} sub={myPayable ? 'QR ready' : 'Nothing to pay'} tone="danger" />
        <Kpi icon="cash" label="You should receive" value={formatINR(myReceivable)} sub={myReceivable ? 'Send a reminder' : 'Nothing pending'} tone="success" />
        <Kpi icon="shield" label="UPI setup" value={`${members.length - missingUpi.length}/${members.length}`} sub={missingUpi.length ? `${missingUpi.length} incomplete` : 'All ready'} tone="accent" />
      </section>}

      {!isSolo && missingUpi.length > 0 && (
        <div className="mb-5 rounded-2xl border border-pending/35 bg-pending/10 p-4 flex flex-wrap items-center gap-3" role="status">
          <span className="icon-tile h-11 w-11 !text-pending"><Icon name="wallet" size={22} /></span>
          <div className="flex-1 min-w-[220px]">
            <p className="font-display font-bold">{missingUpi.map((m) => m.name).join(', ')} need a UPI ID</p>
            <p className="text-[13px] text-ink-soft">A valid UPI ID is required before a payment QR can be created.</p>
          </div>
          <Link to="/room/members" className="btn-primary">Complete profiles</Link>
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.85fr)] gap-6 items-start">
        <div className="space-y-7 min-w-0">
          {/* Pending confirmations */}
          {pendingConfirmations.length > 0 && (
            <section aria-labelledby="confirm-title">
              <SectionTitle id="confirm-title" icon="check" title="Waiting for the receiver to confirm" sub="The balance becomes final after the other member confirms receipt" badge={`${pendingConfirmations.length} pending`} />
              <div className="space-y-2.5">
                {pendingConfirmations.map((s) => {
                  const from = members.find((m) => m.id === s.fromId)
                  const to = members.find((m) => m.id === s.toId)
                  const missing = !s.confirmedBy.includes(s.fromId) ? from : to
                  if (!from || !to || !missing) return null
                  return (
                    <div key={s.id} className="card p-4 flex flex-wrap items-center gap-3">
                      <Avatar name={from.name} color={from.color} size={40} />
                      <Icon name="arrowRight" className="text-ink-faint" />
                      <Avatar name={to.name} color={to.color} size={40} />
                      <div className="flex-1 min-w-[180px]">
                        <p className="font-semibold text-[14.5px]">{from.name} → {to.name} · {formatINR(s.amountPaise)}</p>
                        <p className="text-[12px] text-ink-soft">{s.method.toUpperCase()} · {dateLabel(s.createdAt)}</p>
                      </div>
                      {isCloudRoomActive && missing.id !== me?.id ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-line-light px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-soft"><Icon name="shield" size={16} /> {missing.name} must confirm from their login</span>
                      ) : (
                        <button className="btn-primary" onClick={() => { confirmSettlement(s.id, missing.id); pushToast({ message: `${missing.name} confirmed the payment. Balances updated.`, tone: 'ok' }) }}>
                          <Icon name="check" size={18} /> {missing.id === me?.id ? 'I confirm' : `Confirm as ${missing.name}`}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Due payments */}
          <section aria-labelledby="due-title">
            <SectionTitle id="due-title" icon="qr" title={isSolo ? "No shared payments yet" : "Who should pay now?"} sub={isSolo ? "This is a one-person expense space. Add members whenever you want to share bills." : "RoomHisaab combined all bills into the fewest clear payments"} badge={debts.length ? `${formatINR(totalPending)} pending` : 'Clear'} />
            {debts.length === 0 ? (
              <div className="card p-6 text-center">
                <span className="icon-tile h-14 w-14 mx-auto !rounded-full"><Icon name="check" size={27} /></span>
                <p className="font-display font-bold text-[18px] mt-3">{isSolo ? "No member payments yet" : "All settled"}</p>
                <p className="text-[13.5px] text-ink-soft mt-1">{isSolo ? "Add members later if you start sharing costs." : "Nobody needs to pay another member right now."}</p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {debts.map((d, i) => (
                    <DebtRow key={`${d.fromId}-${d.toId}`} debt={d} members={members} index={i} onSettle={(d) => { setSettleMethod('cash'); setSettleDebt(d) }} onPay={setPayDebt} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          {/* Payment history */}
          <section aria-labelledby="history-title">
            <SectionTitle id="history-title" icon="receipt" title="Past member payments" sub="Only confirmed payments change the final balances" />
            {recentSettlements.length === 0 ? (
              <div className="card p-5 text-[13.5px] text-ink-soft">{isSolo ? "You started with a personal expense space, so there are no member payments to show." : "No member-to-member payments have been recorded yet. Purchases are shown in Expenses & History."}</div>
            ) : (
              <div className="card divide-y divide-line-light overflow-hidden">
                {recentSettlements.map((s) => {
                  const from = members.find((m) => m.id === s.fromId)
                  const to = members.find((m) => m.id === s.toId)
                  const done = s.confirmedBy.includes(s.fromId) && s.confirmedBy.includes(s.toId)
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={clsx('icon-tile h-10 w-10', done ? '!text-moneyin' : '!text-pending')}><Icon name={done ? 'check' : 'sparkles'} size={19} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[14px] truncate">{from?.name ?? 'Member'} → {to?.name ?? 'Member'}</p>
                        <p className="text-[11.5px] text-ink-soft">{dateLabel(s.createdAt)} · {s.method.toUpperCase()}</p>
                      </div>
                      <p className="num font-semibold">{formatINR(s.amountPaise)}</p>
                      <span className={done ? 'badge-ok rounded-full px-2 py-1 text-[10.5px] font-bold' : 'badge-warn rounded-full px-2 py-1 text-[10.5px] font-bold'}>{done ? 'Confirmed' : 'Pending'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24">
          {!isSolo && <>
            <CustomQr members={members.filter((m) => !m.isVirtual)} myApp={me?.preferredUpiApp ?? 'any'} />
            <PaymentProfiles members={members} />
          </>}
          <div className="rounded-[22px] bg-[#15172F] text-[#F1F0FF] border border-white/10 p-5 overflow-hidden relative">
            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#4F46C8]/35 blur-2xl" aria-hidden="true" />
            <Icon name="shield" size={26} className="relative text-[#A8A0FF]" />
            <h2 className="relative text-[18px] text-white mt-3">Before you pay</h2>
            <p className="relative text-[13px] leading-relaxed text-[#C5C3E1] mt-2">RoomHisaab passes only the UPI ID, amount and note to your payment app. Enter your PIN only in that app. This website never asks for a PIN, OTP or bank password.</p>
          </div>
        </aside>
      </div>

      <PaySheet debt={payDebt} members={members} open={!!payDebt} onClose={() => setPayDebt(null)} onPaid={(d) => { setSettleMethod('upi'); setSettleDebt(d) }} />
      <SettleSheet debt={settleDebt} members={members} meId={me?.id} open={!!settleDebt} onClose={() => setSettleDebt(null)} initialMethod={settleMethod} />
    </>
  )
}

function Kpi({ icon, label, value, sub, tone }: { icon: 'wallet' | 'arrowRight' | 'cash' | 'shield'; label: string; value: string; sub: string; tone: 'primary' | 'danger' | 'success' | 'accent' }) {
  const toneClass = { primary: 'text-primary', danger: 'text-overdue', success: 'text-moneyin', accent: 'text-accent' }[tone]
  return (
    <div className="card p-4">
      <div className={clsx('flex items-center gap-2', toneClass)}><Icon name={icon} size={19} /><span className="text-[11px] font-bold uppercase tracking-[0.12em]">{label}</span></div>
      <p className="num font-display text-[24px] sm:text-[28px] mt-2 leading-none">{value}</p>
      <p className="text-[12px] text-ink-soft mt-1.5">{sub}</p>
    </div>
  )
}

function SectionTitle({ id, icon, title, sub, badge }: { id: string; icon: 'qr' | 'check' | 'receipt'; title: string; sub: string; badge?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <span className="icon-tile h-10 w-10"><Icon name={icon} size={20} /></span>
      <div className="flex-1 min-w-[200px]"><h2 id={id} className="text-[18px] leading-tight">{title}</h2><p className="text-[12px] text-ink-soft">{sub}</p></div>
      {badge && <span className="rounded-full border border-primary/25 bg-primary/10 text-primary px-2.5 py-1 text-[11.5px] font-bold">{badge}</span>}
    </div>
  )
}

function CustomQr({ members, myApp }: { members: Member[]; myApp: UpiApp }) {
  const { pushToast } = useStore()
  const [toId, setToId] = usePersistentState('payments.customQr.toId', () => members.find((m) => m.upiId)?.id ?? members[0]?.id ?? '')
  const [amount, setAmount] = usePersistentState('payments.customQr.amount', '')
  const [note, setNote] = usePersistentState('payments.customQr.note', 'RoomHisaab bill')
  const [app, setApp] = usePersistentState<UpiApp>('payments.customQr.app', myApp)
  const qrRef = useRef<HTMLDivElement>(null)
  const to = members.find((m) => m.id === toId) ?? members[0]
  const paise = parseRupeesToPaise(amount) ?? 0
  const payload = to && paise > 0 ? { payeeVpa: to.upiId, payeeName: to.fullName || to.name, amountPaise: paise, note: note || 'RoomHisaab bill', ref: `RH-CUSTOM-${paise}` } : null
  const qr = payload ? upiQrPayload(payload) : null
  const link = payload ? buildUpiLaunchLink({ ...payload, app }) : null
  const genericLink = payload ? buildUpiLink({ ...payload, app: 'any' }) : null

  async function copy() {
    if (!genericLink) return
    try { await navigator.clipboard.writeText(genericLink); pushToast({ message: 'Payment link copied.', tone: 'ok' }) }
    catch { pushToast({ message: genericLink, tone: 'warn' }) }
  }
  function download() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas || !to) return
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `roomhisaab-bill-${formatINR(paise)}.png`; a.click()
  }

  return (
    <section className="card p-5" aria-labelledby="custom-qr-title">
      <div className="flex items-center gap-3 mb-1"><span className="icon-tile h-11 w-11"><Icon name="qr" size={22} /></span><div><h2 id="custom-qr-title" className="text-[18px] leading-tight">Make a separate payment QR</h2><p className="text-[12px] text-ink-soft">For a one-time amount such as a deposit; this does not add a split expense</p></div></div>
      <div className="space-y-3.5 mt-4">
        <div>
          <label className="label" htmlFor="custom-to">Pay to</label>
          <select id="custom-to" className="input" value={to?.id ?? ''} onChange={(e) => setToId(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.upiId ? ` · ${m.upiId}` : ' · UPI missing'}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="custom-amount">Exact bill amount</label>
          <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-display font-bold text-ink-soft">₹</span>
            <input id="custom-amount" className="input num !pl-9 !text-[18px]" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        </div>
        <div><label className="label" htmlFor="custom-note">Bill note</label><input id="custom-note" className="input" value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} /></div>
        <div><span className="label">Payment app on this phone</span><div className="flex flex-wrap gap-2">{UPI_APPS.map((a) => <button key={a.id} type="button" onClick={() => setApp(a.id)} className={app === a.id ? 'chip-on' : 'chip-off'} aria-pressed={app === a.id}>{a.label}</button>)}</div></div>
      </div>

      {!to?.upiId ? (
        <div className="mt-4 rounded-xl bg-pending/10 border border-pending/30 p-3 text-[13px] text-ink-soft">Add a UPI ID for {to?.name ?? 'this member'} to create the QR. <Link to="/room/members" className="inline-flex min-h-[44px] items-center font-bold text-primary underline">Open profile</Link></div>
      ) : qr ? (
        <div className="text-center mt-5">
          <div ref={qrRef} className="qr-shell inline-grid place-items-center rounded-[22px] p-3.5"><QRCodeCanvas value={qr} size={196} level="M" includeMargin bgColor="#FFFFFF" fgColor="#18172B" /></div>
          <p className="num font-display text-[22px] mt-2">{formatINR(paise)}</p>
          <p className="text-[12px] text-ink-soft">{to.name} · {to.upiId}</p>
          {link && <a href={link} className="btn-accent w-full mt-3"><Icon name="wallet" /> Open payment app</a>}
          <div className="grid grid-cols-2 gap-2 mt-2"><button onClick={copy} className="btn-outline !px-2"><Icon name="copy" size={17} /> Link copy</button><button onClick={download} className="btn-outline !px-2"><Icon name="download" size={17} /> QR save</button></div>
        </div>
      ) : <p className="text-[12.5px] text-ink-soft mt-4 text-center">Enter an amount and the QR will appear here.</p>}
    </section>
  )
}

function PaymentProfiles({ members }: { members: Member[] }) {
  const { pushToast } = useStore()
  async function copyUpi(m: Member) {
    if (!m.upiId) return
    try { await navigator.clipboard.writeText(m.upiId); pushToast({ message: `UPI ID for ${m.name} copied.`, tone: 'ok' }) } catch { pushToast({ message: m.upiId, tone: 'warn' }) }
  }
  return (
    <section className="card p-5" aria-labelledby="profiles-title">
      <div className="flex items-center gap-3 mb-4"><span className="icon-tile h-11 w-11"><Icon name="users" size={22} /></span><div className="flex-1"><h2 id="profiles-title" className="text-[18px] leading-tight">Receiving UPI IDs</h2><p className="text-[12px] text-ink-soft">The address used when each person receives money</p></div><Link to="/room/members" className="btn-ghost !min-h-[40px] !px-3 !text-[12.5px] font-bold text-primary">Edit</Link></div>
      <div className="space-y-3">
        {members.map((m) => {
          const score = m.isVirtual ? 0 : profileScore(m)
          return (
            <div key={m.id} className="rounded-2xl border border-line-light p-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={m.name} color={m.color} size={40} />
                <div className="flex-1 min-w-0"><p className="font-semibold text-[14px] truncate">{m.name}</p><p className="text-[11.5px] text-ink-soft truncate">{m.isVirtual ? 'Tracking only' : m.upiId ?? 'UPI ID missing'}</p></div>
                {m.upiId && <button onClick={() => copyUpi(m)} className="btn-ghost !px-2.5" aria-label={`Copy UPI ID for ${m.name}`}><Icon name="copy" size={18} /></button>}
              </div>
              {!m.isVirtual && <div className="flex items-center gap-2 mt-3"><div className="meter flex-1"><span style={{ width: `${score}%` }} /></div><span className="text-[11px] font-bold text-ink-soft">{score}%</span></div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
