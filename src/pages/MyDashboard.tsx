import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useRoomData, useStore } from '../hooks/useStore'
import { computeNet, cycleRangeForRoom } from '../lib/balances'
import { formatINR } from '../lib/money'
import { catOf } from '../lib/constants'
import { PageHead } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { missingProfileFields, profileCompletion } from '../components/MemberProfileFields'
import { UPI_APPS } from '../lib/upi'
import type { Expense } from '../lib/types'
import clsx from 'clsx'

export default function MyDashboard() {
  const { setCurrentMember, loadDemo, pushToast, cloud, isCloudRoomActive } = useStore()
  const { room, members, expenses, settlements, me } = useRoomData()
  const cycle = useMemo(() => cycleRangeForRoom(room), [room])
  const nets = useMemo(() => computeNet(expenses, settlements, members), [expenses, settlements, members])
  const realMembers = members.filter((m) => !m.isVirtual)
  const isSolo = realMembers.length === 1

  const live = useMemo(() => expenses.filter((e) => !e.deleted && e.status === 'confirmed'), [expenses])
  const inCycle = (e: Expense) => e.createdAt >= cycle.start && e.createdAt <= cycle.end
  const myCycle = useMemo(() => {
    if (!me) return { paid: 0, share: 0, bought: 0, sharedCount: 0 }
    let paid = 0, share = 0, bought = 0, sharedCount = 0
    for (const e of live) {
      if (!inCycle(e)) continue
      if (e.payerId === me.id) { paid += e.amountPaise; bought++ }
      const mine = e.splits.find((s) => s.memberId === me.id)?.paise ?? 0
      if (mine) { share += mine; sharedCount++ }
    }
    return { paid, share, bought, sharedCount }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, me, cycle.start, cycle.end])

  if (!room || !me) {
    return (
      <>
        <PageHead title="My spending" sub="Only your money will appear here after you join a room" />
        <EmptyState emoji="👤" title="Join or create a room first" body="After joining a room, this page will show your purchases, shares and balance." action={<><Link to="/onboarding" className="btn-primary">Set up room</Link><button className="btn-outline" onClick={() => loadDemo()}>Load demo</button></>} />
      </>
    )
  }

  const myNet = nets.find((n) => n.memberId === me.id)?.netPaise ?? 0
  const boughtByMe = live.filter((e) => e.payerId === me.id).slice(0, 8)
  const roomActivity = live.slice(0, 10)
  const completion = profileCompletion(me)
  const missing = missingProfileFields(me)
  const totalCycle = live.filter(inCycle).reduce((s, e) => s + e.amountPaise, 0)

  function switchAccount(id: string) {
    const m = members.find((x) => x.id === id)
    if (setCurrentMember(id) && m) pushToast({ message: `Showing the dashboard for ${m.name}.`, tone: 'ok' })
  }

  return (
    <>
      <PageHead title={isSolo ? "My spending" : "Home"} sub={`${isSolo ? "Personal expense space" : "Only your money"} · ${me.name} · ${room.name} · ${new Date(cycle.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(cycle.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
        right={<Link to="/room/buy" className="btn-primary"><Icon name="scan" size={18} /> Add Expense</Link>} />

      {/* Account switcher */}
      <section className="card p-4 mb-5" aria-label={isSolo ? "Personal room" : "Member account switcher"}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="icon-tile h-11 w-11"><Icon name="users" size={21} /></span>
          <div className="flex-1 min-w-[180px]">
            <p className="font-display font-bold">{isSolo ? 'Your personal room' : isCloudRoomActive ? 'My cloud identity' : 'Who am I?'}</p>
            <p className="text-[12.5px] text-ink-soft">{isSolo ? 'This space has only your expenses for now. You can add members later.' : isCloudRoomActive ? <>You are signed in as <b className="text-ink">@{cloud.username}</b>. Other members cannot edit entries as you.</> : 'Select your name to set your dashboard and default payer.'}</p>
          </div>
        </div>
        {isSolo ? (
          <div className="mt-3.5"><Link to="/room/members" className="btn-outline"><Icon name="plus" size={16} /> Add members later</Link></div>
        ) : isCloudRoomActive ? (
          <div className="flex flex-wrap gap-2 mt-3.5">
            <span className="chip-on"><Avatar name={me.name} color={me.color} size={20} />{me.name} · active</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line-light px-3 py-2 text-[12px] font-semibold text-ink-soft"><Icon name="shield" size={15} /> Other members’ activity is view-only</span>
            <Link to="/room/members" className="btn-ghost !px-3 !py-2 !text-[13px]"><Icon name="share" size={16} /> Invite / join link</Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-3.5">
            {realMembers.map((m) => (
              <button key={m.id} type="button" onClick={() => switchAccount(m.id)} className={me.id === m.id ? 'chip-on' : 'chip-off'} aria-pressed={me.id === m.id}>
                <Avatar name={m.name} color={m.color} size={20} />{m.name}{me.id === m.id ? ' · active' : ''}
              </button>
            ))}
            <Link to="/room/members" className="btn-ghost !px-3 !py-2 !text-[13px]"><Icon name="share" size={16} /> Invite / join link</Link>
          </div>
        )}
      </section>

      {/* Personal KPIs */}
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5" aria-label="Personal summary">
        <div className="relative overflow-hidden rounded-[24px] bg-[#15172F] text-[#F1F0FF] border border-white/10 shadow-lift3d p-5 sm:col-span-2">
          <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-[#4F46C8]/35 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-wrap gap-4 items-center">
            <Avatar name={me.name} color={me.color} size={58} />
            <div className="flex-1 min-w-[190px]">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#A8A0FF]">{isSolo ? 'Personal spending this cycle' : myNet > 0 ? 'You should receive' : myNet < 0 ? 'You need to pay' : 'You are settled'}</p>
              <p className="num font-display text-[38px] leading-none mt-1.5">{formatINR(isSolo ? totalCycle : Math.abs(myNet))}</p>
              <p className="text-[12.5px] text-[#C5C3E1] mt-2">{isSolo ? `Your expenses · profile ${completion}% complete` : `Overall room position · profile ${completion}% complete`}</p>
            </div>
            {isSolo ? <Link to="/room/buy" className="btn-accent !px-4"><Icon name="plus" /> Add expense</Link> : <Link to="/room/payments" className="btn-accent !px-4"><Icon name="qr" /> Open Payments</Link>}
          </div>
        </div>
        <MiniStat label={isSolo ? "Purchases this cycle" : "I paid this cycle"} value={isSolo ? String(myCycle.bought) : formatINR(myCycle.paid)} sub={isSolo ? "Added to your personal space" : `${myCycle.bought} purchases paid by me`} />
        {!isSolo && <MiniStat label="My share of room costs" value={formatINR(myCycle.share)} sub={`Included in ${myCycle.sharedCount} expenses`} />}
        {!isSolo && <MiniStat label="Whole room spent" value={formatINR(totalCycle)} sub="Visible to all members" />}
        <MiniStat label="Payment app" value={UPI_APPS.find((a) => a.id === (me.preferredUpiApp ?? 'any'))?.label ?? 'Any'} sub={me.upiId ?? 'Add UPI ID'} />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start min-w-0">
        <div className="space-y-5 min-w-0">
          <SectionCard title="My details" sub="Used for QR payments and reminders" right={<Link to="/room/members" className="btn-outline !px-3 !py-2 !text-[12.5px]">Edit profile</Link>}>
            <div className="flex items-center gap-2.5">
              <div className="meter flex-1"><span style={{ width: `${completion}%` }} /></div>
              <span className="text-[12px] font-bold text-ink-soft">{completion}%</span>
            </div>
            <dl className="grid sm:grid-cols-2 gap-3 mt-4 text-[13px]">
              <Detail label="Full name" value={me.fullName || 'Not added'} />
              <Detail label="UPI ID" value={me.upiId || 'Not added'} />
              <Detail label="WhatsApp" value={me.phone || 'Not added'} />
              <Detail label="Email" value={me.email || 'Not added'} />
              <Detail label="Default share" value={me.defaultSharePercent ? `${me.defaultSharePercent}%` : 'Equal auto'} />
              <Detail label="Monthly budget" value={me.monthlyBudgetPaise ? formatINR(me.monthlyBudgetPaise) : 'Not set'} />
            </dl>
            {missing.length > 0 && <p className="mt-3 rounded-xl border border-pending/30 bg-pending/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-pending">Missing: {missing.join(', ')}. Add these details in your profile.</p>}
          </SectionCard>

          <SectionCard title="My purchases" sub="Expenses paid by me" right={<Link to="/room/buy" className="btn-ghost !min-h-[40px] !px-2.5 !text-[13px] font-bold text-primary">+ Add Expense</Link>}>
            <ExpenseRows items={boughtByMe} members={members} empty="No purchases paid by you yet. Add one from Add Expense." meId={me.id} />
          </SectionCard>
        </div>

        <div className="space-y-5 min-w-0">
          {isSolo ? (
            <section className="card p-5">
              <div className="flex items-start gap-3">
                <span className="icon-tile h-11 w-11"><Icon name="users" size={21} /></span>
                <div><h2 className="text-[17px]">Just you for now</h2><p className="mt-1 text-[12.5px] text-ink-soft">Your expenses stay in this personal space. Invite people later if you start sharing costs.</p></div>
              </div>
              <Link to="/room/members" className="btn-outline mt-4"><Icon name="plus" size={16} /> Add members</Link>
            </section>
          ) : (          <SectionCard title="All member balances" sub="Everyone can see this · + receives money · − pays money">
            <ul className="space-y-2.5">
              {members.map((m) => {
                const n = nets.find((x) => x.memberId === m.id)
                const paid = live.filter((e) => e.payerId === m.id && inCycle(e)).reduce((s, e) => s + e.amountPaise, 0)
                const net = n?.netPaise ?? 0
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-line-light p-3">
                    <Avatar name={m.name} color={m.color} size={40} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[14px] truncate">{m.name}{m.id === me.id ? ' (you)' : ''}</span>
                      <span className="block text-[11.5px] text-ink-soft">Paid {formatINR(paid)} this cycle · overall share {formatINR(n?.owedPaise ?? 0)}</span>
                    </span>
                    <span className={clsx('num font-display text-[16px]', net > 0 ? 'text-moneyin' : net < 0 ? 'text-overdue' : 'text-ink-soft')}>{net > 0 ? '+' : net < 0 ? '−' : ''}{formatINR(Math.abs(net))}</span>
                  </li>
                )
              })}
            </ul>
          </SectionCard>) }

          {!isSolo && <SectionCard title="Room activity" sub="All room expenses" right={<Link to="/room/history" className="btn-ghost !min-h-[40px] !px-2.5 !text-[13px] font-bold text-primary">History</Link>}>
            <ExpenseRows items={roomActivity} members={members} empty="No room expenses yet." meId={me.id} />
          </SectionCard>}
        </div>
      </div>
    </>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className="num font-display text-[24px] leading-none mt-2 truncate">{value}</p>
      <p className="text-[12px] text-ink-soft mt-2 truncate">{sub}</p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line-light px-3 py-2.5 min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="font-semibold truncate mt-0.5">{value}</dd>
    </div>
  )
}

function ExpenseRows({ items, members, empty, meId }: { items: Expense[]; members: { id: string; name: string }[]; empty: string; meId: string }) {
  if (!items.length) return <p className="text-[13px] text-ink-soft text-center py-6">{empty}</p>
  return (
    <ul className="space-y-2.5">
      {items.map((e) => {
        const cat = catOf(e.category)
        const payer = members.find((m) => m.id === e.payerId)?.name ?? 'Member'
        const myShare = e.splits.find((s) => s.memberId === meId)?.paise
        return (
          <li key={e.id} className="flex items-start gap-3 rounded-xl border border-line-light p-2.5">
            <span className="grid place-items-center h-10 w-10 rounded-xl text-lg shrink-0" style={{ background: `${cat.color}18` }} aria-hidden="true">{cat.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold truncate">{e.description}</span>
              <span className="block text-[11.5px] leading-snug text-ink-soft">
                Paid by {payer} · {e.method.toUpperCase()}{e.instantPay ? ' · Instant' : ''} · {new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
              {(myShare || e.vendorName) && <span className="block text-[11.5px] leading-snug text-ink-soft">{myShare ? `My share ${formatINR(myShare)}` : ''}{myShare && e.vendorName ? ' · ' : ''}{e.vendorName ?? ''}</span>}
            </span>
            <span className="num font-display text-[15px] shrink-0">{formatINR(e.amountPaise)}</span>
          </li>
        )
      })}
    </ul>
  )
}
