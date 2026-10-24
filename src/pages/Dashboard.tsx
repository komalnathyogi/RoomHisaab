import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useStore, useRoomData } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { computeNet, cycleRangeForRoom, simplifyDebts, totalSpent, isFullySettled, byCategory } from '../lib/balances'
import { formatINR, pctChange } from '../lib/money'
import { catOf } from '../lib/constants'
import { DebtRow } from '../components/DebtRow'
import { SettleSheet } from '../components/SettleSheet'
import { PaySheet } from '../components/PaySheet'
import { ExpenseCard } from '../components/ExpenseCard'
import { ExpenseModal } from '../components/ExpenseModal'
import { Confetti } from '../components/Confetti'
import { EmptyState } from '../components/EmptyState'
import { DashboardSkeleton } from '../components/Skeleton'
import { CountUp } from '../components/CountUp'
import { Avatar } from '../components/Avatar'
import { Icon, type IconName } from '../components/Icon'
import { profileCompletion } from '../components/MemberProfileFields'
import { RoomPulse3D } from '../components/RoomPulse3D'
import { WelcomeTour, hasSeenWelcomeTour } from '../components/WelcomeTour'
import { fetchMyRecoveryKeyStatus } from '../lib/cloud'
import { clearPendingInstantPurchase, loadPendingInstantPurchase, type InstantPurchaseIntent } from '../lib/instantPay'
import type { Debt } from '../lib/balances'
import type { Expense } from '../lib/types'
import clsx from 'clsx'

/*
 * SYSTEMATIC DASHBOARD
 * Upar se neeche sirf ek order: 1) Mera status  2) Action required
 * 3) QR settle  4) Balances / setup  5) Recent activity
 */
export default function Dashboard() {
  const { state, ready, isCloudRoomActive, deleteExpense, reactExpense, pushToast, runDueRecurring, loadDemo, canEditExpense } = useStore()
  const { room, members, expenses, settlements, me } = useRoomData()
  const location = useLocation()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [settleDebt, setSettleDebt] = useState<Debt | null>(null)
  const [settleMethod, setSettleMethod] = usePersistentState<'cash' | 'upi'>('payments.settleMethod', 'cash')
  const [payDebt, setPayDebt] = useState<Debt | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState<boolean | null>(null)
  const [pendingInstant, setPendingInstant] = useState<InstantPurchaseIntent | null>(() => loadPendingInstantPurchase())
  const [tourOpen, setTourOpen] = useState(false)

  const cycle = useMemo(() => cycleRangeForRoom(room), [room])
  const prevCycle = useMemo(() => ({ start: cycle.start - 30 * 86400000, end: cycle.start - 1 }), [cycle.start])

  useEffect(() => {
    if (!ready || !room) return
    const added = runDueRecurring()
    if (added > 0) pushToast({ message: `${added} recurring expense was added automatically.`, tone: 'ok' })
  }, [ready, room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('tour') === '1') {
      setTourOpen(true)
      navigate('/room', { replace: true })
      return
    }
    if (params.get('add') === '1') {
      setEditing(null); setAddOpen(true)
      navigate('/room', { replace: true })
    }
  }, [location.search, navigate])

  useEffect(() => {
    if (ready && room && !hasSeenWelcomeTour(room.id)) setTourOpen(true)
  }, [ready, room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isCloudRoomActive || !room?.id) {
      setRecoveryReady(null)
      return
    }
    let cancelled = false
    fetchMyRecoveryKeyStatus(room.id)
      .then((status) => { if (!cancelled) setRecoveryReady(status.hasKey) })
      .catch(() => { if (!cancelled) setRecoveryReady(null) })
    return () => { cancelled = true }
  }, [isCloudRoomActive, room?.id])

  useEffect(() => {
    const refreshPending = () => {
      const intent = loadPendingInstantPurchase()
      setPendingInstant(intent && room && intent.roomId === room.id ? intent : null)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refreshPending() }
    refreshPending()
    window.addEventListener('focus', refreshPending)
    window.addEventListener('pageshow', refreshPending)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refreshPending)
      window.removeEventListener('pageshow', refreshPending)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [room?.id])

  const debts = useMemo(() => simplifyDebts(expenses, settlements, members), [expenses, settlements, members])
  const nets = useMemo(() => computeNet(expenses, settlements, members), [expenses, settlements, members])
  const monthTotal = useMemo(() => totalSpent(expenses, cycle.start, cycle.end), [expenses, cycle.start, cycle.end])
  const prevTotal = useMemo(() => totalSpent(expenses, prevCycle.start, prevCycle.end), [expenses, prevCycle.start, prevCycle.end])
  const recent = useMemo(() => expenses.filter((e) => !e.deleted).slice(0, 5), [expenses])
  const settled = useMemo(() => isFullySettled(expenses, settlements, members), [expenses, settlements, members])
  const pendingInbox = state.inbox.filter((i) => i.status === 'new').length
  const realMembers = members.filter((m) => !m.isVirtual)
  const membersWithoutUpi = realMembers.filter((m) => !m.upiId)
  const isSolo = realMembers.length === 1
  const profileAvg = realMembers.length ? Math.round(realMembers.reduce((s, m) => s + profileCompletion(m), 0) / realMembers.length) : 0
  const pendingConfirmations = settlements.filter((s) => !(s.confirmedBy.includes(s.fromId) && s.confirmedBy.includes(s.toId)))
  const totalPending = debts.reduce((s, d) => s + d.paise, 0)
  const qrReadyDebts = debts.filter((d) => members.find((m) => m.id === d.toId)?.upiId).length
  const myDebt = debts.find((d) => d.fromId === me?.id)
  const myReceivableDebt = debts.find((d) => d.toId === me?.id)

  useEffect(() => { if (settled && expenses.length > 0) setCelebrate(true) }, [settled, expenses.length])

  const myNet = nets.find((x) => x.memberId === me?.id)
  const myAmount = myNet?.netPaise ?? 0

  const cancelPendingInstant = () => {
    if (!pendingInstant) return
    clearPendingInstantPurchase(pendingInstant.id)
    setPendingInstant(null)
    pushToast({ message: 'Pending Instant Pay was not added.', tone: 'warn' })
  }

  const trend = pctChange(monthTotal, prevTotal)
  const topCat = useMemo(() => {
    const c = byCategory(expenses, cycle.start, cycle.end)
    const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]
    return best ? { ...catOf(best[0]), paise: best[1] } : null
  }, [expenses, cycle.start, cycle.end])

  const cycleDays = Math.max(1, Math.round((cycle.end - cycle.start) / 86400000))
  const elapsedDays = Math.min(cycleDays, Math.max(1, Math.floor((Date.now() - cycle.start) / 86400000) + 1))
  const dailyAverage = Math.round(monthTotal / elapsedDays)
  const projected = Math.round((monthTotal / elapsedDays) * cycleDays)
  const maxAbsNet = Math.max(1, ...nets.map((n) => Math.abs(n.netPaise)))

  if (!ready) return <DashboardSkeleton />

  if (!room || members.length === 0) {
    return (
      <>
        <p className="kicker">Welcome</p>
        <h1 className="text-[28px] mb-1 mt-1">Welcome to RoomHisaab</h1>
        <p className="text-ink-soft text-[14.5px] mb-5">This is a shared notebook for room money. Choose the situation that matches you.</p>
        <EmptyState emoji="🏠" title="Start in one of these ways"
          body="Create a new room, join a friend’s room, sign in to an old room, or open the demo first. Looking around does not move real money."
          action={<>
            <Link to="/onboarding" className="btn-primary">Create my room</Link>
            <Link to="/join" className="btn-outline">Join with a link</Link>
            <Link to="/login" className="btn-outline">Sign in</Link>
            <button className="btn-outline" onClick={() => { void loadDemo().then((opened) => { if (opened) setTourOpen(true) }) }}>Try demo + tour</button>
            <Link to="/room/guide" className="btn-ghost"><Icon name="help" size={17} /> Read the guide</Link>
          </>} />
        <WelcomeTour open={tourOpen} roomId={room?.id} onClose={() => setTourOpen(false)} />
      </>
    )
  }

  const openAdd = () => { setEditing(null); setAddOpen(true) }
  const actions: { icon: IconName; title: string; body: string; to: string; cta: string; tone: 'warn' | 'primary' | 'danger' }[] = []
  if (membersWithoutUpi.length && !isSolo) actions.push({
    icon: 'wallet', tone: 'warn', to: '/room/members', cta: 'Complete profiles',
    title: `${membersWithoutUpi.length} member${membersWithoutUpi.length === 1 ? ' needs' : 's need'} a UPI ID`,
    body: `${membersWithoutUpi.map((m) => m.name).join(', ')} cannot receive a QR payment until this is added.`,
  })
  if (pendingInbox) actions.push({
    icon: 'sparkles', tone: 'primary', to: '/inbox', cta: 'Review',
    title: `${pendingInbox} expense${pendingInbox === 1 ? '' : 's'} prepared for you`,
    body: 'Check the SMS, file, or voice result, then confirm only if it is correct.',
  })
  if (pendingConfirmations.length) actions.push({
    icon: 'check', tone: 'danger', to: '/room/payments', cta: 'Confirm',
    title: `${pendingConfirmations.length} payment${pendingConfirmations.length === 1 ? '' : 's'} waiting for confirmation`,
    body: 'The balance becomes final only after the other member confirms that the money was received.',
  })
  if (debts.length) actions.push({
    icon: 'qr', tone: 'primary', to: '/room/payments', cta: 'Open QR',
    title: `${formatINR(totalPending)} is still pending between members`,
    body: `Open Payments to see exactly who should pay whom. It can be cleared in ${debts.length} payment${debts.length > 1 ? 's' : ''}.`,
  })
  if (isCloudRoomActive && recoveryReady === false) actions.push({
    icon: 'shield', tone: 'warn', to: '/settings', cta: 'Create recovery key',
    title: 'Protect this login before you need it',
    body: 'A one-time Personal Recovery Key can restore this same member and room if you forget your password.',
  })

  const setupItems = [
    { label: 'Room notebook created', done: true },
    ...(!isSolo ? [{ label: 'Members added', done: realMembers.length >= 2 }] : []),
    { label: isSolo ? 'Your personal space is ready' : 'Everyone can receive QR money', done: isSolo || (membersWithoutUpi.length === 0 && realMembers.length > 0) },
    { label: 'First purchase written', done: expenses.length > 0 },
    { label: 'Optional monthly bill set', done: state.recurring.length > 0 },
    ...(isCloudRoomActive ? [{ label: 'Password Recovery Key saved', done: recoveryReady === true }] : []),
  ]
  const setupPercent = Math.round((setupItems.filter((x) => x.done).length / setupItems.length) * 100)

  return (
    <>
      <WelcomeTour open={tourOpen} roomId={room.id} onClose={() => setTourOpen(false)} />
      <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">{isSolo ? 'Personal Home' : 'Room Home'}</p>
          <h1 className="text-[27px] sm:text-[32px] mt-1">Hello, {me?.name ?? 'there'}</h1>
          <p className="text-ink-soft text-[13.5px] mt-1">{room.name} · {new Date(cycle.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(cycle.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/room/guide" className="btn-outline !hidden !px-3.5 !py-2 !text-[13px] min-[640px]:!inline-flex"><Icon name="help" size={16} /> Guide</Link>
          <Link to="/room/my" className="btn-outline !px-3.5 !py-2 !text-[13px]"><Icon name="users" size={16} /> My money</Link>
          <div className="hidden sm:flex -space-x-1.5" aria-label="Room members">
            {members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} color={m.color} size={36} className="ring-2 ring-surface-page" />)}
          </div>
        </div>
      </div>

      {pendingInstant && (
        <section className="mb-5 rounded-[22px] border border-primary/30 bg-primary/10 p-4 shadow-card sm:p-5" aria-labelledby="dashboard-instant-title">
          <div className="flex flex-wrap items-center gap-3">
            <span className="icon-tile h-12 w-12"><Icon name="wallet" size={23} /></span>
            <div className="min-w-[220px] flex-1">
              <p className="kicker">Finish Instant Pay</p>
              <h2 id="dashboard-instant-title" className="mt-1 text-[19px]">{pendingInstant.expense.description} · {formatINR(pendingInstant.expense.amountPaise)}</h2>
              <p className="mt-1 text-[13px] text-ink-soft">Add it only if your UPI app showed a successful payment.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/room/buy" className="btn-accent !px-4"><Icon name="arrowRight" size={17} /> Finish in Quick Buy</Link>
              <button type="button" onClick={cancelPendingInstant} className="btn-outline !px-4">Not paid</button>
            </div>
          </div>
        </section>
      )}

      {/* KPI system */}
      <section className="grid lg:grid-cols-4 gap-3.5 mb-5" aria-label="Room summary">
        <div className="relative overflow-hidden rounded-[24px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 lg:col-span-2">
          <div className="absolute -right-16 -top-20 hidden h-52 w-52 rounded-full bg-[#4F46C8]/35 blur-3xl sm:block" aria-hidden="true" />
          <div className="absolute -left-10 -bottom-24 hidden h-44 w-44 rounded-full bg-[#DE7726]/20 blur-3xl sm:block" aria-hidden="true" />
          <div className="relative flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-[220px]">
              <p className="text-[11px] uppercase tracking-[0.15em] font-bold text-[#A8A0FF]">
                {isSolo ? 'Your personal space' : myAmount > 0 ? 'Overall · you should receive' : myAmount < 0 ? 'Overall · you need to pay' : 'Overall · settled'}
              </p>
              <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                <CountUp value={isSolo ? monthTotal : Math.abs(myAmount)} className="font-display text-[40px] sm:text-[48px] leading-none" />
                {!isSolo && myAmount === 0 && <span className="font-display text-[19px]">settled</span>}
              </div>
              <p className="text-[13px] text-[#C5C3E1] mt-2">
                {isSolo ? 'Your personal expenses in this period. Invite members later if you begin sharing costs.' : myAmount > 0 ? 'Other members should return this money to you.' : myAmount < 0 ? 'This is your pending share. Open Payments when you are ready to pay it.' : 'You do not need to pay or receive money right now.'}
                {debts.length ? ` The full room can be cleared in ${debts.length} payment${debts.length === 1 ? '' : 's'}.` : ''}
              </p>
            </div>
            {isSolo ? (
              <button onClick={openAdd} className="btn-accent !px-5"><Icon name="plus" /> Add expense</button>
            ) : myDebt ? (
              <button onClick={() => setPayDebt(myDebt)} className="btn-accent !px-5"><Icon name="qr" /> Pay with QR</button>
            ) : myReceivableDebt ? (
              <Link to="/room/payments" className="btn-accent !px-5"><Icon name="wallet" /> Request payment</Link>
            ) : (
              <button onClick={openAdd} className="btn-accent !px-5"><Icon name="plus" /> Add expense</button>
            )}
          </div>
        </div>

        <KpiCard icon="receipt" label={isSolo ? "Personal spend this period" : "Room spent this period"} value={formatINR(monthTotal)} sub={trend !== null ? `${trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} ${Math.abs(trend)}% compared with the previous period` : 'This is the first period'} />
        <KpiCard icon="qr" label="Still to settle" value={formatINR(totalPending)} sub={debts.length ? (qrReadyDebts === debts.length ? `${debts.length} QR payment${debts.length === 1 ? '' : 's'} ready` : qrReadyDebts ? `${qrReadyDebts}/${debts.length} QR ready · some UPI IDs missing` : 'Add UPI IDs to make QR payments') : 'Nobody needs to pay right now'} accent />
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" aria-label="Quick actions">
        <Quick icon="scan" title="Quick Buy" body="I bought something · pay or add it" to="/room/buy" />
        <Quick icon="plus" title="Add expense" body="A bill was paid · choose the split" onClick={openAdd} />
        <Quick icon="sparkles" title="Auto Capture" body="No typing · SMS, file, or voice" to="/inbox" badge={pendingInbox} />
        <Quick icon="qr" title="Payments" body="Pay money that is pending" to="/room/payments" />
      </section>

      <div className="grid xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)] gap-6 items-start">
        <div className="space-y-7 min-w-0">
          {/* Action Center */}
          <section aria-labelledby="action-title">
            <SectionHeader id="action-title" icon="bolt" title="Needs your attention" sub="Do these pending things first" badge={actions.length ? `${actions.length} pending` : 'All clear'} />
            {actions.length === 0 ? (
              <div className="card p-5 flex items-center gap-3">
                <span className="icon-tile h-12 w-12 !text-moneyin"><Icon name="check" size={23} /></span>
                <div><p className="font-display font-bold">Nothing is pending for you</p><p className="text-[13px] text-ink-soft">Profiles, payments, and Auto Capture need no action right now.</p></div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {actions.map((a) => (
                  <Link key={a.title} to={a.to} className="card p-4 flex gap-3 hover:-translate-y-.5 hover:shadow-lift3d transition-all">
                    <span className={clsx('icon-tile h-11 w-11', a.tone === 'warn' && '!text-pending', a.tone === 'danger' && '!text-overdue')}><Icon name={a.icon} size={21} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display font-bold text-[14.5px] leading-snug">{a.title}</span>
                      <span className="block text-[12.5px] text-ink-soft mt-1 leading-snug">{a.body}</span>
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary mt-2">{a.cta} <Icon name="arrowRight" size={15} /></span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Settle now */}
          <section aria-labelledby="settle-title">
            <SectionHeader id="settle-title" icon="wallet" title={isSolo ? "Personal balance" : "Who should pay whom?"} sub={isSolo ? "No shared balance yet. Add members whenever you are ready." : "Tap Pay for an exact QR or UPI app link"} badge={debts.length ? `${debts.length} payments` : undefined} />
            {debts.length === 0 ? (
              <div className="card p-6 text-center">
                <span className="icon-tile h-14 w-14 mx-auto !rounded-full !text-moneyin"><Icon name="check" size={27} /></span>
                <p className="font-display font-bold mt-3">{expenses.length ? 'Everyone is settled' : 'No expenses written yet'}</p>
                <p className="text-[13px] text-ink-soft mt-1">{expenses.length ? (isSolo ? 'Your personal expenses are up to date.' : 'Nobody needs to pay or receive money right now.') : (isSolo ? 'Add a personal purchase with Quick Buy, Add Expense, or Auto Capture.' : 'When someone pays for a shared thing, add it with Quick Buy, Add Expense, or Auto Capture.')}</p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {debts.map((d, i) => (
                    <DebtRow key={`${d.fromId}-${d.toId}`} debt={d} members={members} index={i}
                      onSettle={(debt) => { setSettleMethod('cash'); setSettleDebt(debt) }} onPay={setPayDebt} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          {/* Recent */}
          <section aria-labelledby="recent-title">
            <SectionHeader id="recent-title" icon="receipt" title="Latest expenses added" sub="The newest 5 entries in the room notebook" link={{ to: '/room/history', label: 'View all history' }} />
            {recent.length === 0 ? (
              <EmptyState emoji="🧾" title={isSolo ? "Write your first expense" : "Write the first shared expense"} body={isSolo ? "Add your own purchases here. You can invite people later if you start sharing costs." : "Example: groceries, WiFi, electricity, or snacks. Choose Quick Buy for the fastest entry."}
                action={<><Link className="btn-primary" to="/room/buy"><Icon name="scan" size={18} /> Quick Buy</Link><button className="btn-outline" onClick={openAdd}><Icon name="plus" size={18} /> Add expense</button><Link className="btn-outline" to="/inbox"><Icon name="sparkles" size={18} /> Auto Capture</Link></>} />
            ) : (
              <ul className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {recent.map((e, i) => (
                    <ExpenseCard key={e.id} e={e} members={members} index={i} meId={me?.id} canEdit={canEditExpense(e, me?.id)}
                      onEdit={(x) => { setEditing(x); setAddOpen(true) }} onDelete={deleteExpense}
                      onReact={(id, emoji) => me && reactExpense(id, emoji, me.id)} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24">
          {/* Setup checklist */}
          <section className="card p-5" aria-labelledby="setup-title">
            <div className="flex items-center gap-3">
              <span className="icon-tile h-11 w-11"><Icon name="shield" size={21} /></span>
              <div className="flex-1"><h2 id="setup-title" className="text-[17px] leading-tight">{isSolo ? 'Personal setup' : 'Room setup'}</h2><p className="text-[12px] text-ink-soft">Finish these one-time steps</p></div>
              <span className="font-display font-bold text-primary">{setupPercent}%</span>
            </div>
            <div className="meter mt-4"><span style={{ width: `${setupPercent}%` }} /></div>
            <ul className="mt-4 space-y-2.5">
              {setupItems.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5 text-[13.5px]">
                  <span className={clsx('grid place-items-center h-6 w-6 rounded-full shrink-0', item.done ? 'bg-moneyin/15 text-moneyin' : 'bg-ink/5 text-ink-faint')}><Icon name={item.done ? 'check' : 'plus'} size={14} /></span>
                  <span className={item.done ? 'font-semibold' : 'text-ink-soft'}>{item.label}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl bg-surface-alt border border-line-light p-3.5 mt-4 flex items-center gap-3">
              <div className="flex-1"><p className="text-[12px] text-ink-soft">Profile completion</p><p className="font-display font-bold">{isSolo ? `${profileAvg}% · your profile` : `${profileAvg}% · ${realMembers.length - membersWithoutUpi.length}/${realMembers.length} QR ready`}</p></div>
              <Link to="/room/members" className="btn-outline !px-3 !py-2 !text-[12.5px]">{isSolo ? 'Edit profile' : 'Manage'}</Link>
            </div>
          </section>

          {/* Balances */}
          <section className="card p-5" aria-labelledby="balances-title">
            <div className="flex items-center gap-3 mb-4">
              <span className="icon-tile h-11 w-11"><Icon name="users" size={21} /></span>
              <div className="flex-1"><h2 id="balances-title" className="text-[17px] leading-tight">{isSolo ? "Your balance" : "Member balances"}</h2><p className="text-[12px] text-ink-soft">{isSolo ? "Your personal expenses · members can be added later" : "+ gets money · − pays · ₹0 settled"}</p></div>
              <Link to="/room/payments" className="btn-ghost !min-h-[40px] !px-3 !text-[12.5px] font-bold text-primary">Pay</Link>
            </div>
            <div className="space-y-4">
              {members.map((m) => {
                const net = nets.find((n) => n.memberId === m.id)?.netPaise ?? 0
                return (
                  <div key={m.id}>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} color={m.color} size={36} />
                      <p className="flex-1 font-semibold text-[14px] truncate">{m.name}{m.isVirtual ? ' · Virtual' : ''}</p>
                      <p className={clsx('num text-[14.5px]', net > 0 ? 'text-moneyin' : net < 0 ? 'text-overdue' : 'text-ink-soft')}>{net > 0 ? '+' : net < 0 ? '−' : ''}{formatINR(Math.abs(net))}</p>
                    </div>
                    <div className="h-2 rounded-full bg-ink/5 overflow-hidden mt-2 ml-[48px]">
                      <div className={clsx('h-full rounded-full transition-all duration-500', net > 0 ? 'bg-moneyin' : net < 0 ? 'bg-overdue' : 'bg-ink-faint')} style={{ width: `${Math.max(net === 0 ? 0 : 8, Math.round((Math.abs(net) / maxAbsNet) * 100))}%` }} />
                    </div>
                    <p className="text-[11px] text-ink-faint mt-1 ml-[48px]">{net > 0 ? 'receives' : net < 0 ? 'pays' : 'settled'}{!m.isVirtual && !m.upiId ? ' · UPI missing' : ''}</p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Cycle insight */}
          <section className="rounded-[22px] bg-[#15172F] text-[#F1F0FF] border border-white/10 p-5 relative overflow-hidden" aria-labelledby="cycle-title">
            <div className="absolute -right-12 -top-12 hidden h-32 w-32 rounded-full bg-[#DE7726]/20 blur-2xl sm:block" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <span className="grid place-items-center h-11 w-11 rounded-2xl bg-white/10 text-[#A8A0FF]"><Icon name="chart" size={21} /></span>
              <div><h2 id="cycle-title" className="text-[17px] text-white leading-tight">This period in short</h2><p className="text-[12px] text-[#A9C4B5]">Day {elapsedDays} of {cycleDays}</p></div>
            </div>
            <dl className="relative grid grid-cols-2 gap-3 mt-5">
              <Insight label="Average per day" value={formatINR(dailyAverage)} />
              <Insight label="Expected period total" value={formatINR(projected)} />
              <Insight label="Top category" value={topCat ? topCat.label : '—'} />
              <Insight label="Biggest category amount" value={topCat ? formatINR(topCat.paise) : '₹0'} />
            </dl>
            <Link to="/room/insights" className="relative inline-flex items-center gap-2 mt-5 rounded-xl bg-white text-[#3C34A3] font-display font-bold px-4 min-h-[42px] text-[13.5px]">Open full report <Icon name="arrowRight" size={16} /></Link>
          </section>
        </aside>
      </div>

      <RoomPulse3D members={members} nets={nets} totalPaise={monthTotal} reduceMotion={state.profile.reduceMotion} />

      <ExpenseModal open={addOpen} edit={editing} onClose={() => { setAddOpen(false); setEditing(null) }} />
      <PaySheet debt={payDebt} members={members} open={!!payDebt} onClose={() => setPayDebt(null)} onPaid={(d) => { setSettleMethod('upi'); setSettleDebt(d) }} />
      <SettleSheet debt={settleDebt} members={members} meId={me?.id} open={!!settleDebt} onClose={() => setSettleDebt(null)} initialMethod={settleMethod} />
      <span className="sr-only" aria-live="polite">{debts.length === 0 ? 'The room is settled.' : `${debts.length} payments are pending.`}</span>
    </>
  )
}

function KpiCard({ icon, label, value, sub, accent = false }: { icon: IconName; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="card p-5">
      <div className={clsx('flex items-center gap-2', accent ? 'text-accent' : 'text-primary')}><Icon name={icon} size={19} /><span className="text-[11px] font-bold uppercase tracking-[0.12em]">{label}</span></div>
      <p className="num font-display text-[27px] mt-2.5 leading-none">{value}</p>
      <p className="text-[12px] text-ink-soft mt-2">{sub}</p>
    </div>
  )
}

function Quick({ icon, title, body, to, onClick, badge = 0 }: { icon: IconName; title: string; body: string; to?: string; onClick?: () => void; badge?: number }) {
  const inner = (
    <>
      <span className="icon-tile h-11 w-11"><Icon name={icon} size={21} /></span>
      <span className="min-w-0"><span className="block font-display font-bold text-[14.5px] leading-tight">{title}</span><span className="block text-[11.5px] leading-snug text-ink-soft mt-.5">{body}</span></span>
      {badge > 0 && <span className="badge-alert absolute top-2.5 right-2.5 grid place-items-center min-w-[21px] h-[21px] px-1 rounded-full text-[11px] font-bold">{badge}</span>}
    </>
  )
  const cls = 'card relative p-3.5 flex items-center gap-3 text-left hover:-translate-y-.5 hover:shadow-lift3d transition-all active:scale-[.98]'
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

function SectionHeader({ id, icon, title, sub, badge, link }: { id: string; icon: IconName; title: string; sub: string; badge?: string; link?: { to: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-3.5">
      <span className="icon-tile h-10 w-10"><Icon name={icon} size={20} /></span>
      <div className="flex-1 min-w-[180px]"><h2 id={id} className="text-[18px] leading-tight">{title}</h2><p className="text-[12px] text-ink-soft">{sub}</p></div>
      {badge && <span className="rounded-full border border-primary/25 bg-primary/10 text-primary px-2.5 py-1 text-[11.5px] font-bold">{badge}</span>}
      {link && <Link to={link.to} className="ml-auto inline-flex min-h-[40px] items-center gap-1 text-[13px] font-bold text-primary">{link.label} <Icon name="arrowRight" size={15} /></Link>}
    </div>
  )
}

function Insight({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/5 border border-white/10 p-3"><dt className="text-[10.5px] uppercase tracking-wide text-[#AAA8C9] font-bold">{label}</dt><dd className="num font-display text-[16px] mt-1 truncate">{value}</dd></div>
}
