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
import { WelcomeTour, hasSeenWelcomeTour, markWelcomeTourSeen } from '../components/WelcomeTour'
import { fetchMyRecoveryKeyStatus } from '../lib/cloud'
import { clearPendingInstantPurchase, loadPendingInstantPurchase, type InstantPurchaseIntent } from '../lib/instantPay'
import type { Debt } from '../lib/balances'
import type { Expense } from '../lib/types'
import clsx from 'clsx'

const WELCOME_CARD_PREFIX = 'roomhisaab.welcome-card-dismissed.v1.'
const DEMO_WELCOME_KEY = 'roomhisaab.demo.welcome-card-dismissed.v1'
function welcomeCardKey(memberId?: string | null) { return `${WELCOME_CARD_PREFIX}${memberId || 'room'}` }
function rememberWelcomeCardDismissed(memberId?: string | null) {
  try { window.localStorage.setItem(welcomeCardKey(memberId), '1') } catch { /* storage may be blocked */ }
}

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
  const [welcomeCardOpen, setWelcomeCardOpen] = useState(false)
  const [demoWelcomeCardOpen, setDemoWelcomeCardOpen] = useState(false)

  const cycle = useMemo(() => cycleRangeForRoom(room), [room])
  const prevCycle = useMemo(() => ({ start: cycle.start - 30 * 86400000, end: cycle.start - 1 }), [cycle.start])

  useEffect(() => {
    if (!ready || !room) return
    const added = runDueRecurring()
    if (added > 0) pushToast({ message: `${added} recurring bill${added === 1 ? ' is' : 's are'} ready to review.`, tone: 'ok' })
  }, [ready, room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('tour') === '1') {
      rememberWelcomeCardDismissed(me?.id ?? room?.id)
      markWelcomeTourSeen(room?.id)
      setWelcomeCardOpen(false)
      setTourOpen(true)
      navigate('/room', { replace: true })
      return
    }
    if (params.get('add') === '1') {
      setEditing(null); setAddOpen(true)
      navigate('/room', { replace: true })
    }
  }, [location.search, navigate, me?.id, room?.id])

  useEffect(() => {
    if (!ready || !room || room.demo || addOpen || new URLSearchParams(location.search).get('add') === '1' || hasSeenWelcomeTour(room.id)) return
    const timer = window.setTimeout(() => {
      markWelcomeTourSeen(room.id)
      setTourOpen(true)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [ready, room?.id, room?.demo, addOpen, location.search])

  useEffect(() => {
    if (!ready || !room || room.demo) {
      setWelcomeCardOpen(false)
      return
    }
    const openingFirstExpense = new URLSearchParams(location.search).get('add') === '1'
    if (openingFirstExpense || addOpen) return
    try { setWelcomeCardOpen(window.localStorage.getItem(welcomeCardKey(me?.id ?? room.id)) !== '1') }
    catch { setWelcomeCardOpen(false) }
  }, [ready, room?.id, room?.demo, location.search, me?.id, addOpen])

  useEffect(() => {
    if (!ready || !room?.demo) {
      setDemoWelcomeCardOpen(false)
      return
    }
    try { setDemoWelcomeCardOpen(window.localStorage.getItem(DEMO_WELCOME_KEY) !== '1') }
    catch { setDemoWelcomeCardOpen(false) }
  }, [ready, room?.id, room?.demo])

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
  const myPaidMonth = useMemo(() => expenses.filter((e) => !e.deleted && e.status === 'confirmed' && e.createdAt >= cycle.start && e.createdAt <= cycle.end && e.payerId === me?.id).reduce((n, e) => n + e.amountPaise, 0), [expenses, cycle.start, cycle.end, me?.id])
  const myShareMonth = useMemo(() => expenses.filter((e) => !e.deleted && e.status === 'confirmed' && e.createdAt >= cycle.start && e.createdAt <= cycle.end).reduce((n, e) => n + (e.splits.find((x) => x.memberId === me?.id)?.paise ?? 0), 0), [expenses, cycle.start, cycle.end, me?.id])
  const prevTotal = useMemo(() => totalSpent(expenses, prevCycle.start, prevCycle.end), [expenses, prevCycle.start, prevCycle.end])
  const recent = useMemo(() => expenses.filter((e) => !e.deleted).slice(0, 5), [expenses])
  const settled = useMemo(() => isFullySettled(expenses, settlements, members), [expenses, settlements, members])
  const pendingInbox = state.inbox.filter((i) => i.status === 'new').length
  const realMembers = members.filter((m) => !m.isVirtual)
  const membersWithoutUpi = realMembers.filter((m) => !m.upiId)
  const isSolo = realMembers.length === 1
  const profileAvg = realMembers.length ? Math.round(realMembers.reduce((s, m) => s + profileCompletion(m), 0) / realMembers.length) : 0
  const pendingConfirmations = settlements.filter((s) => !(s.confirmedBy.includes(s.fromId) && s.confirmedBy.includes(s.toId)))
  const pendingBills = expenses.filter((e) => !e.deleted && e.status === 'pending' && e.source === 'recurring')
  const isPersonal = members.filter((member) => !member.isVirtual).length <= 1
  const unpaidMonth = expenses.filter((e) => !e.deleted && e.status === 'pending' && e.createdAt >= cycle.start && e.createdAt <= cycle.end).reduce((sum, expense) => sum + expense.amountPaise, 0)
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
            <button className="btn-outline" onClick={() => { void loadDemo(); setTourOpen(false) }}>Try Demo</button>
            <Link to="/room/guide" className="btn-ghost"><Icon name="help" size={17} /> Read the guide</Link>
          </>} />
        <WelcomeTour open={tourOpen} roomId={room?.id} onClose={() => setTourOpen(false)} />
      </>
    )
  }

  const openAdd = () => { setEditing(null); setAddOpen(true) }
  const actions: { icon: IconName; title: string; body: string; to: string; cta: string; tone: 'warn' | 'primary' | 'danger' }[] = []
  if (membersWithoutUpi.length && !isPersonal) actions.push({
    icon: 'wallet', tone: 'warn', to: '/room/members', cta: 'Complete profiles',
    title: `${membersWithoutUpi.length} member${membersWithoutUpi.length === 1 ? ' needs' : 's need'} a UPI ID`,
    body: `${membersWithoutUpi.map((m) => m.name).join(', ')} cannot receive a QR payment until this is added.`,
  })
  if (pendingInbox) actions.push({
    icon: 'sparkles', tone: 'primary', to: '/inbox', cta: 'Review',
    title: `${pendingInbox} expense${pendingInbox === 1 ? '' : 's'} prepared for you`,
    body: 'Check the SMS, file, or voice result, then confirm only if it is correct.',
  })
  if (pendingBills.length) actions.push({
    icon: 'bolt', tone: 'primary', to: '/room/history', cta: 'Review Bill',
    title: `${pendingBills.length} recurring bill${pendingBills.length === 1 ? ' is' : 's are'} ready to review`,
    body: 'Check the amount and split. Save it as paid only when it has been paid.',
  })
  if (!isPersonal && pendingConfirmations.length) actions.push({
    icon: 'check', tone: 'danger', to: '/room/payments', cta: 'Confirm',
    title: `${pendingConfirmations.length} payment${pendingConfirmations.length === 1 ? '' : 's'} waiting for confirmation`,
    body: 'The balance becomes final only after the other member confirms that the money was received.',
  })
  if (!isPersonal && debts.length) actions.push({
    icon: 'qr', tone: 'primary', to: '/room/payments', cta: 'Open QR',
    title: `${formatINR(totalPending)} is still pending between members`,
    body: `Open Settle Up to see exactly who should pay whom. It can be cleared in ${debts.length} payment${debts.length > 1 ? 's' : ''}.`,
  })
  if (isCloudRoomActive && recoveryReady === false) actions.push({
    icon: 'shield', tone: 'warn', to: '/settings', cta: 'Create recovery key',
    title: 'Protect this login before you need it',
    body: 'A one-time Personal Recovery Key can restore this same member and room if you forget your password.',
  })

  const setupItems = [
    { label: 'Room notebook created', done: true },
    ...(!isPersonal ? [{ label: 'Members added', done: realMembers.length >= 2 }] : []),
    { label: isPersonal ? 'Your personal space is ready' : 'Everyone can receive QR money', done: isPersonal || (membersWithoutUpi.length === 0 && realMembers.length > 0) },
    { label: 'First purchase written', done: expenses.length > 0 },
    { label: 'Optional monthly bill set', done: state.recurring.length > 0 },
    ...(isCloudRoomActive ? [{ label: 'Password Recovery Key saved', done: recoveryReady === true }] : []),
  ]
  const setupPercent = Math.round((setupItems.filter((x) => x.done).length / setupItems.length) * 100)

  return (
    <>
      <WelcomeTour open={tourOpen} roomId={room.id} personal={isPersonal} onClose={() => setTourOpen(false)} />
      <Confetti fire={celebrate} onDone={() => setCelebrate(false)} />

      <header id="dashboard-overview" tabIndex={-1} className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Home</p>
          <h1 className="text-[27px] sm:text-[32px] mt-1">{isPersonal ? 'My Expenses' : `Hello, ${me?.name ?? 'there'}`}</h1>
          <p className="text-ink-soft text-[13.5px] mt-1">{isPersonal ? `Personal Room · ${new Date(cycle.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(cycle.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : `${room.name} · ${new Date(cycle.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(cycle.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</p>
        </div>
        <Link to="/room/guide" className="btn-outline !px-3.5 !py-2 !text-[13px]"><Icon name="help" size={16} /> Help</Link>
      </header>

      {demoWelcomeCardOpen && room.demo && (
        <section className="relative mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4 pr-12 sm:p-5" aria-labelledby="demo-welcome-title">
          <button type="button" className="btn-ghost absolute right-2 top-2 !min-h-[40px] !w-10 !px-0 text-xl" aria-label="Dismiss demo introduction" onClick={() => { try { window.localStorage.setItem(DEMO_WELCOME_KEY, '1') } catch { /* storage may be blocked */ } setDemoWelcomeCardOpen(false) }}>×</button>
          <p className="kicker">Sample room</p>
          <h2 id="demo-welcome-title" className="mt-1 text-[20px]">You're Exploring a Demo</h2>
          <p className="mt-1 text-[13px] text-ink-soft">Try adding an expense, checking balances, or viewing reports. Changes stay in this sample room.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary !px-4" onClick={() => { try { window.localStorage.setItem(DEMO_WELCOME_KEY, '1') } catch { /* storage may be blocked */ } setDemoWelcomeCardOpen(false); openAdd() }}>Add Expense</button>
            <button type="button" className="btn-outline !px-4" onClick={() => { try { window.localStorage.setItem(DEMO_WELCOME_KEY, '1') } catch { /* storage may be blocked */ } setDemoWelcomeCardOpen(false); document.getElementById('dashboard-overview')?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Explore Home</button>
          </div>
        </section>
      )}

      {welcomeCardOpen && !room.demo && (
        <section className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5" aria-labelledby="welcome-card-title">
          <p className="kicker">Your room is ready</p>
          <h2 id="welcome-card-title" className="mt-1 text-[20px]">Welcome to RoomHisaab</h2>
          <p className="mt-1 text-[13px] text-ink-soft">Add your first expense or explore the app. You can open the tour again from Help.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary !px-4" onClick={() => { rememberWelcomeCardDismissed(me?.id ?? room.id); setWelcomeCardOpen(false); openAdd() }}>Add First Expense</button>
            <button type="button" className="btn-outline !px-4" onClick={() => { rememberWelcomeCardDismissed(me?.id ?? room.id); setWelcomeCardOpen(false); setTourOpen(true) }}>Take a Quick Tour</button>
            <button type="button" className="btn-ghost !px-4" onClick={() => { rememberWelcomeCardDismissed(me?.id ?? room.id); setWelcomeCardOpen(false) }}>Skip</button>
          </div>
        </section>
      )}

      {pendingInstant && (
        <section className="mb-5 rounded-[22px] border border-pending/35 bg-pending/10 p-4 shadow-card sm:p-5" role="status" aria-labelledby="dashboard-instant-title">
          <div className="flex flex-wrap items-center gap-3">
            <span className="icon-tile h-12 w-12"><Icon name="wallet" size={23} /></span>
            <div className="min-w-[220px] flex-1">
              <p className="kicker">Payment needs your review</p>
              <h2 id="dashboard-instant-title" className="mt-1 text-[19px]">{pendingInstant.expense.description} · {formatINR(pendingInstant.expense.amountPaise)}</h2>
              <p className="mt-1 text-[13px] text-ink-soft">Check your UPI app. RoomHisaab cannot check the payment for you.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/room/buy?mode=scan" className="btn-primary !px-4">Finish Expense</Link>
              <button type="button" onClick={cancelPendingInstant} className="btn-outline !px-4">Cancel Expense</button>
            </div>
          </div>
        </section>
      )}

      {/* 1. Shared balance or a simple personal-room welcome */}
      {isPersonal ? (
        <section className="relative mb-4 overflow-hidden rounded-[24px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 sm:p-6" aria-label="Personal expenses">
          <div className="absolute -right-16 -top-20 hidden h-52 w-52 rounded-full bg-[#4F46C8]/35 blur-3xl sm:block" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center gap-4"><div className="flex-1 min-w-[220px]"><p className="text-[11px] uppercase tracking-[0.15em] font-bold text-[#A8A0FF]">PERSONAL ROOM</p><h2 className="mt-1 font-display text-[23px] text-white">Your expenses, all in one place</h2><p className="text-[13px] text-[#C5C3E1] mt-1">Track bills and spending. Add roommates later if you start sharing costs.</p></div><button onClick={openAdd} className="btn-accent !px-5"><Icon name="plus" /> Add Expense</button></div>
        </section>
      ) : (
        <section className="relative mb-4 overflow-hidden rounded-[24px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 sm:p-6" aria-label="Your room balance">
          <div className="absolute -right-16 -top-20 hidden h-52 w-52 rounded-full bg-[#4F46C8]/35 blur-3xl sm:block" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center gap-4"><div className="flex-1 min-w-[220px]">
            <p className="text-[11px] uppercase tracking-[0.15em] font-bold text-[#A8A0FF]">{myAmount > 0 ? 'You will receive' : myAmount < 0 ? 'You need to pay' : 'Your balance is clear'}</p>
            {myAmount !== 0 && <CountUp value={Math.abs(myAmount)} className="mt-1.5 block font-display text-[40px] sm:text-[48px] leading-none" />}
            <p className="text-[13px] text-[#C5C3E1] mt-2">{myAmount > 0 ? 'Other members need to pay you.' : myAmount < 0 ? 'Pay this amount to clear your room balance.' : 'You do not need to pay anyone right now.'}</p>
          </div>
          {myDebt ? <Link to="/room/payments" className="btn-accent !px-5"><Icon name="wallet" /> Settle Up</Link> : myReceivableDebt ? <Link to="/room/payments" className="btn-accent !px-5"><Icon name="wallet" /> View Payments</Link> : <button onClick={openAdd} className="btn-accent !px-5"><Icon name="plus" /> Add Expense</button>}</div>
        </section>
      )}

      {/* 2. Three quick actions */}
      <section className="grid sm:grid-cols-3 gap-3 mb-6" aria-label="Quick actions">
        <Quick icon="plus" title="Add Expense" body="Record a room expense" onClick={openAdd} />
        <Quick icon="scan" title="Quick Pay" body="Enter purchase details before scanning" to="/room/buy?mode=scan" />
        {isPersonal ? <Quick icon="chart" title="View Reports" body="See your spending by month" to="/room/insights" /> : <Quick icon="wallet" title="Settle Up" body="Pay or confirm a room payment" to="/room/payments" />}
      </section>

      {/* 3. Tasks appear only when needed */}
      {actions.length > 0 && <section className="mb-6" aria-labelledby="action-title">
        <SectionHeader id="action-title" icon="bolt" title="Things to Finish" sub="Review these items when you are ready" badge={`${Math.min(actions.length, 3)} task${Math.min(actions.length, 3) === 1 ? '' : 's'}`} />
        <div className="grid sm:grid-cols-2 gap-3">
          {actions.slice(0, 3).map((a) => <Link key={a.title} to={a.to} className="card p-4 flex gap-3 hover:-translate-y-.5 hover:shadow-lift3d transition-all">
            <span className={clsx('icon-tile h-11 w-11', a.tone === 'warn' && '!text-pending', a.tone === 'danger' && '!text-overdue')}><Icon name={a.icon} size={21} /></span>
            <span className="flex-1 min-w-0"><span className="block font-display font-bold text-[14.5px] leading-snug">{a.title}</span><span className="block text-[12.5px] text-ink-soft mt-1 leading-snug">{a.body}</span><span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary mt-2">{a.cta} <Icon name="arrowRight" size={15} /></span></span>
          </Link>)}
        </div>
      </section>}

      {/* 4. One monthly summary; no duplicate period card */}
      <section className="mb-6" aria-labelledby="this-month-title">
        <SectionHeader id="this-month-title" icon="chart" title="This Month" sub={isPersonal ? 'Your personal spending and bills' : 'Your room spending and your part'} link={{ to: '/room/insights', label: 'View Reports' }} />
        <div className="grid sm:grid-cols-3 gap-3">
          {isPersonal ? <>
            <KpiCard icon="receipt" label="Total Spent" value={formatINR(monthTotal)} sub="Expenses marked paid this month" />
            <KpiCard icon="cash" label="Paid Expenses" value={formatINR(myPaidMonth)} sub="Money you paid this month" />
            <KpiCard icon="wallet" label="Unpaid Bills" value={formatINR(unpaidMonth)} sub="Bills not marked paid yet" accent />
          </> : <>
            <KpiCard icon="receipt" label="Total Spent" value={formatINR(monthTotal)} sub="All room expenses this month" />
            <KpiCard icon="cash" label="You Paid" value={formatINR(myPaidMonth)} sub="Money you paid for room expenses" />
            <KpiCard icon="wallet" label="Your Share" value={formatINR(myShareMonth)} sub="Your part of the room expenses" accent />
          </>}
        </div>
      </section>

      {/* 5. Recent expenses */}
      <section className="mb-7" aria-labelledby="recent-title">
        <SectionHeader id="recent-title" icon="receipt" title="Recent Expenses" sub="The latest expenses in your room" link={{ to: '/room/history', label: 'View All Expenses' }} />
        {recent.length === 0 ? <EmptyState emoji="🧾" title="No expenses yet" body="Add your first expense to see the room balance." action={<button className="btn-primary" onClick={openAdd}><Icon name="plus" size={18} /> Add First Expense</button>} />
          : <ul className="space-y-2.5"><AnimatePresence initial={false}>{recent.map((e, i) => <ExpenseCard key={e.id} e={e} members={members} index={i} meId={me?.id} canEdit={canEditExpense(e, me?.id)} onEdit={(x) => { setEditing(x); setAddOpen(true) }} onDelete={deleteExpense} onReact={(id, emoji) => me && reactExpense(id, emoji, me.id)} />)}</AnimatePresence></ul>}
      </section>

      {/* 6. Room balances are only useful in Shared Mode */}
      {!isPersonal && <section className="card p-5 mb-6" aria-labelledby="balances-title">
        <div className="flex items-center gap-3 mb-4">
          <span className="icon-tile h-11 w-11"><Icon name="users" size={21} /></span>
          <div className="flex-1"><h2 id="balances-title" className="text-[17px] leading-tight">Room Balances</h2><p className="text-[12px] text-ink-soft">See who needs to pay and who will receive money.</p></div>
          <Link to="/room/payments" className="btn-ghost !min-h-[40px] !px-3 !text-[12.5px] font-bold text-primary">Settle Up</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => { const net = nets.find((n) => n.memberId === m.id)?.netPaise ?? 0; return <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-line-light p-3">
            <Avatar name={m.name} color={m.color} size={36} /><div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{m.name}{m.isVirtual ? ' · Tracking-only' : ''}</p><p className="text-[11px] text-ink-soft">{net > 0 ? 'Will receive' : net < 0 ? 'Needs to pay' : 'No payment due'}{!m.isVirtual && !m.upiId ? ' · Add UPI ID' : ''}</p></div>
            <p className={clsx('num text-[14.5px] font-semibold', net > 0 ? 'text-moneyin' : net < 0 ? 'text-overdue' : 'text-ink-soft')}>{formatINR(Math.abs(net))}</p>
          </div>})}
        </div>
      </section>}

      {isPersonal && <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5" aria-label="Share expenses with roommates">
        <p className="font-display font-bold text-[16px]">Sharing expenses with someone?</p>
        <p className="mt-1 text-[12.5px] text-ink-soft">Add roommates to split future expenses. Your past expenses will stay yours.</p>
        <Link to="/room/members?add=1" className="btn-outline mt-3">Add Roommates</Link>
      </section>}

      {/* 7. Setup is only useful before the first expense */}
      {expenses.length === 0 && <section className="card p-5" aria-labelledby="setup-title">
        <div className="flex items-center gap-3"><span className="icon-tile h-11 w-11"><Icon name="shield" size={21} /></span><div className="flex-1"><h2 id="setup-title" className="text-[17px]">Finish setting up your room</h2><p className="text-[12px] text-ink-soft">You can update these details later.</p></div><span className="font-display font-bold text-primary">{setupPercent}%</span></div>
        <div className="meter mt-4"><span style={{ width: `${setupPercent}%` }} /></div>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2.5">{setupItems.map((item) => <li key={item.label} className="flex items-center gap-2.5 text-[13px]"><span className={clsx('grid place-items-center h-6 w-6 rounded-full shrink-0',item.done?'bg-moneyin/15 text-moneyin':'bg-ink/5 text-ink-faint')}><Icon name={item.done?'check':'plus'} size={14}/></span><span className={item.done?'font-semibold':'text-ink-soft'}>{item.label}</span></li>)}</ul>
        <Link to="/room/members" className="btn-outline mt-4">Invite Members</Link>
      </section>}

      <ExpenseModal open={addOpen} edit={editing} onClose={() => { setAddOpen(false); setEditing(null) }} />
      <PaySheet debt={payDebt} members={members} open={!!payDebt} onClose={() => setPayDebt(null)} onPaid={(d) => { setSettleMethod('upi'); setSettleDebt(d) }} />
      <SettleSheet debt={settleDebt} members={members} meId={me?.id} open={!!settleDebt} onClose={() => setSettleDebt(null)} initialMethod={settleMethod} />
      <span className="sr-only" aria-live="polite">{debts.length === 0 ? 'Your room balance is clear.' : `${debts.length} payments are pending.`}</span>
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
