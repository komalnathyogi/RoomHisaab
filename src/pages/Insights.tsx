import { Suspense, useMemo, useState } from 'react'
import { comparisonRanges, comparisonTotal, dateToInput, inputToEnd, inputToStart, type CompareMetric, type ComparePeriod } from '../lib/comparison'
import { Link } from 'react-router-dom'
import { useStore, useRoomData } from '../hooks/useStore'
import { byCategory, byMethod, byWeek, computeNet, cycleRangeForRoom, totalSpent } from '../lib/balances'
import { catOf } from '../lib/constants'
import { formatINR, pctChange } from '../lib/money'
import { LazyDonut, LazyMethodBar, LazyWeekBars } from '../components/ChartsLazy'
import { PageHead, } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Skeleton } from '../components/Skeleton'
import { Avatar } from '../components/Avatar'
import { download, statementText } from '../lib/csv'
import { Icon } from '../components/Icon'
import clsx from 'clsx'

export default function Insights() {
  const { pushToast } = useStore()
  const { room, members, expenses, settlements, me } = useRoomData()
  const isSolo = members.filter((member) => !member.isVirtual).length === 1
  const cycle = useMemo(() => cycleRangeForRoom(room), [room])
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>('month')
  const [compareTarget, setCompareTarget] = useState('room')
  const [customFrom, setCustomFrom] = useState(() => dateToInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()))
  const [customTo, setCustomTo] = useState(() => dateToInput(Date.now()))
  const customRange = useMemo(() => {
    const start = inputToStart(customFrom)
    const end = inputToEnd(customTo)
    return start !== null && end !== null && end >= start ? { start, end } : null
  }, [customFrom, customTo])
  const comparison = useMemo(() => {
    if (comparePeriod === 'custom' && !customRange) return null
    return comparisonRanges(comparePeriod, Date.now(), { start: cycle.start, end: cycle.end }, customRange ?? undefined)
  }, [comparePeriod, cycle.start, cycle.end, customRange])
  const targetParts = compareTarget.split(':')
  const compareMetric: CompareMetric = targetParts[0] === 'share' ? 'share' : targetParts[0] === 'paid' ? 'paid' : 'room'
  const compareMemberId = targetParts.length > 1 ? targetParts.slice(1).join(':') : undefined
  const comparedCurrent = useMemo(() => comparison ? comparisonTotal(expenses, comparison.current, compareMetric, compareMemberId) : 0, [expenses, comparison, compareMetric, compareMemberId])
  const comparedPrevious = useMemo(() => comparison ? comparisonTotal(expenses, comparison.previous, compareMetric, compareMemberId) : 0, [expenses, comparison, compareMetric, compareMemberId])
  const comparedChange = pctChange(comparedCurrent, comparedPrevious)
  const compareMax = Math.max(comparedCurrent, comparedPrevious, 1)
  const compareTitle = compareMetric === 'room' ? (isSolo ? 'Personal spending' : 'Room spending') : `${compareMetric === 'share' ? 'Share for' : 'Paid by'} ${members.find((member) => member.id === compareMemberId)?.name ?? 'member'}`
  const rangeLabel = (range: { start: number; end: number }) => `${new Date(range.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(range.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  const prev = useMemo(() => ({ start: cycle.start - 30 * 86400000, end: cycle.start - 1 }), [cycle.start])

  const cur = useMemo(() => totalSpent(expenses, cycle.start, cycle.end), [expenses, cycle.start, cycle.end])
  // Fair month-over-month: adhoora current cycle pichhle cycle ke utne hi elapsed samay se compare hota hai.
  const elapsedMs = Math.max(0, Math.min(Date.now(), cycle.end) - cycle.start)
  const old = useMemo(
    () => totalSpent(expenses, prev.start, Math.min(prev.end, prev.start + elapsedMs)),
    [expenses, prev.start, prev.end, elapsedMs],
  )
  const trend = pctChange(cur, old)

  const catData = useMemo(() => {
    const c = byCategory(expenses, cycle.start, cycle.end)
    return Object.entries(c)
      .map(([k, v]) => ({ name: catOf(k).label, value: v, color: catOf(k).color, icon: catOf(k).icon }))
      .sort((a, b) => b.value - a.value)
  }, [expenses, cycle.start, cycle.end])

  const methodData = useMemo(() => byMethod(expenses, cycle.start, cycle.end), [expenses, cycle.start, cycle.end])
  const weekData = useMemo(() => byWeek(expenses, cycle.start), [expenses, cycle.start])
  const nets = useMemo(() => computeNet(expenses, settlements, members), [expenses, settlements, members])

  /** ⭐ auto-insight text — Hinglish, honest numbers ke saath */
  const insight = useMemo(() => {
    if (!catData.length) return null
    const top = catData[0]
    const share = cur ? Math.round((top.value / cur) * 100) : 0
    if (trend === null) return `Spending this cycle is ${formatINR(cur)}. The largest category is ${top.name} (${share}%).`
    if (trend > 0) return `Spending is up ${trend}% this cycle (${formatINR(cur)}), led by ${top.name} (${share}%).`
    if (trend < 0) return `Spending is down ${Math.abs(trend)}% (${formatINR(cur)}). ${top.name} remains the largest category.`
    return `Spending is unchanged at ${formatINR(cur)}. Top category: ${top.name}.`
  }, [catData, cur, trend])

  const perMember = members.map((m) => {
    const n = nets.find((x) => x.memberId === m.id)
    return { m, paid: n?.paidPaise ?? 0, owed: n?.owedPaise ?? 0, net: n?.netPaise ?? 0 }
  })

  const budgetRows = useMemo(() => members.filter((m) => !m.isVirtual).map((member) => {
    const owed = expenses
      .filter((e) => !e.deleted && e.createdAt >= cycle.start && e.createdAt <= cycle.end)
      .reduce((sum, e) => sum + (e.splits.find((sp) => sp.memberId === member.id)?.paise ?? 0), 0)
    const budget = member.monthlyBudgetPaise ?? 0
    return { member, owed, budget, percent: budget ? Math.round((owed / budget) * 100) : 0 }
  }), [members, expenses, cycle.start, cycle.end])

  function exportStatement() {
    const debts = computeNet(expenses, settlements, members)
      .filter((d) => d.netPaise !== 0)
      .sort((a, b) => b.netPaise - a.netPaise)
    const txt = statementText({
      roomName: room?.name ?? 'Room',
      periodLabel: `${new Date(cycle.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(cycle.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
      totalPaise: cur,
      debts: debts.filter((d) => d.netPaise < 0).map((d) => ({
        from: members.find((m) => m.id === d.memberId)?.name ?? '?',
        to: debts.find((x) => x.netPaise > 0) ? (members.find((m) => m.id === debts.find((x) => x.netPaise > 0)!.memberId)?.name ?? '?') : '?',
        paise: -d.netPaise,
      })),
      topCategories: catData.slice(0, 4).map((c) => ({ label: c.name, icon: c.icon, paise: c.value })),
      perMember: perMember.map((p) => ({ name: p.m.name, paid: p.paid, owed: p.owed, net: p.net })),
    })
    download(`roomhisaab-statement-${cycle.label.replace(/\s/g, '-')}.txt`, txt, 'text/plain;charset=utf-8')
    pushToast({ message: 'Statement copied. You can share it on WhatsApp.', tone: 'ok' })
  }

  return (
    <>
      <PageHead title={isSolo ? "Personal reports" : "Reports"} sub={`${isSolo ? "Your expense summary" : "Charts only — no payment happens here"} · Period: ${new Date(cycle.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} → ${new Date(cycle.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
        right={<>
          <button className="btn-outline !px-3.5" onClick={() => window.print()}><Icon name="download" size={17} /> Print / PDF</button>
          <button className="btn-primary !px-3.5" onClick={exportStatement}><Icon name="share" size={17} /> WhatsApp statement</button>
        </>} />

      {insight && (
        <div className="card mb-4 p-4 border-primary/30 bg-primary/5 flex items-start gap-3">
          <span className="icon-tile h-11 w-11"><Icon name="sparkles" size={21} /></span>
          <div>
            <p className="text-[11.5px] uppercase tracking-wide font-bold text-primary mb-0.5">Simple summary</p>
            <p className="text-[14.5px] font-medium">{insight}</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Where did the money go?" sub="Tap a slice to see the exact category amount">
          {catData.length ? (
            <>
              <Suspense fallback={<Skeleton className="h-[220px] w-full" />}>
                <LazyDonut data={catData} />
              </Suspense>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {catData.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} aria-hidden="true" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="num text-ink-soft">{formatINR(c.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-[13.5px] text-ink-soft py-8 text-center">No data for this cycle</p>}
        </SectionCard>

        <SectionCard title="Spending each week" sub="See which week cost the room the most">
          <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
            <LazyWeekBars data={weekData} />
          </Suspense>
        </SectionCard>

        <SectionCard title="How people paid" sub="Cash, UPI, and card totals for this period">
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <LazyMethodBar cash={methodData.cash ?? 0} upi={methodData.upi ?? 0} card={methodData.card ?? 0} />
          </Suspense>
        </SectionCard>

        <SectionCard title={isSolo ? "Your paid amount and share" : "Each person: paid vs share"} sub={isSolo ? "Your payments and assigned expenses in this room" : "+ means receives money · − means pays money"}>
          <ul className="space-y-2.5">
            {perMember.map(({ m, paid, owed, net }) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line-light dark:border-line-dark p-2.5">
                <Avatar name={m.name} color={m.color} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] truncate">{m.name}</p>
                  <p className="num text-[11.5px] text-ink-soft">Paid {formatINR(paid)} · share {formatINR(owed)}</p>
                </div>
                <p className={`num text-[15px] ${net > 0 ? 'text-moneyin' : net < 0 ? 'text-overdue' : 'text-ink-soft'}`}>
                  {net > 0 ? '+' : net < 0 ? '−' : ''}{formatINR(Math.abs(net))}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Budget progress" sub="Each person’s share compared with the monthly budget they set">
          {budgetRows.some((r) => r.budget > 0) ? (
            <ul className="space-y-3.5">
              {budgetRows.map(({ member, owed, budget, percent }) => (
                <li key={member.id} className="rounded-2xl border border-line-light p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} color={member.color} size={38} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[14px] truncate">{member.name}</p>
                      <p className="text-[11.5px] text-ink-soft">{budget ? `${formatINR(owed)} / ${formatINR(budget)} budget` : 'No monthly budget set'}</p>
                    </div>
                    {budget ? (
                      <span className={clsx('rounded-full px-2 py-1 text-[11px] font-bold border', percent >= 100 ? 'border-overdue/30 bg-overdue/10 text-overdue' : percent >= 80 ? 'border-pending/30 bg-pending/10 text-pending' : 'border-moneyin/30 bg-moneyin/10 text-moneyin')}>{percent}%</span>
                    ) : <Link to="/room/members" className="text-[12px] font-bold text-primary">Set budget</Link>}
                  </div>
                  {budget > 0 && <>
                    <div className="meter mt-3"><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
                    <p className={clsx('text-[11.5px] font-semibold mt-1.5', percent >= 100 ? 'text-overdue' : 'text-ink-soft')}>
                      {percent >= 100 ? `${formatINR(owed - budget)} over budget` : `${formatINR(budget - owed)} remaining`}
                    </p>
                  </>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-7">
              <span className="icon-tile h-12 w-12 mx-auto"><Icon name="wallet" size={22} /></span>
              <p className="font-display font-bold mt-3">No monthly budgets are set</p>
              <p className="text-[13px] text-ink-soft mt-1">Add budgets in member profiles to track them here.</p>
              <Link to="/room/members" className="btn-primary mt-4">Set budgets</Link>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard className="mt-4" title="Compare expenses" sub="Choose whose spending and which dates you want to compare.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="label" htmlFor="compare-target">Compare</label>
            <select id="compare-target" className="input" value={compareTarget} onChange={(event) => setCompareTarget(event.target.value)}>
              <option value="room">{isSolo ? "Personal expenses" : "Whole room spending"}</option>
              {me && <option value={`share:${me.id}`}>My share of room bills</option>}
              {me && <option value={`paid:${me.id}`}>Bills paid by me</option>}
              {members.filter((member) => !member.isVirtual && member.id !== me?.id).map((member) => <option key={`share-${member.id}`} value={`share:${member.id}`}>{member.name} — their share</option>)}
              {members.filter((member) => !member.isVirtual && member.id !== me?.id).map((member) => <option key={`paid-${member.id}`} value={`paid:${member.id}`}>{member.name} — bills they paid</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="compare-period">Time period</label>
            <select id="compare-period" className="input" value={comparePeriod} onChange={(event) => setComparePeriod(event.target.value as ComparePeriod)}>
              <option value="week">This week vs last week</option>
              <option value="month">This month vs last month</option>
              <option value="cycle">This room cycle vs previous cycle</option>
              <option value="custom">Choose dates</option>
            </select>
          </div>
          {comparePeriod === 'custom' && <>
            <div><label className="label" htmlFor="compare-from">From</label><input id="compare-from" className="input" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></div>
            <div><label className="label" htmlFor="compare-to">To</label><input id="compare-to" className="input" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></div>
          </>}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
          {compareMetric === 'room' ? (isSolo ? 'Personal expenses count each bill once.' : 'Room spending counts each bill once.') : compareMetric === 'share' ? 'A person’s share is the part of each room bill assigned to them.' : 'Bills paid counts the full bill amount paid by that person.'}
          {' '}The previous period uses the same number of days where possible.
        </p>
        {!comparison ? (
          <p className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 p-3 text-[13px] font-semibold text-overdue" role="alert">Choose a valid start and end date. The end date must not be before the start date.</p>
        ) : (
          <div className="mt-4 rounded-2xl border border-line-light bg-surface-alt/70 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="kicker">{compareTitle}</p><p className="mt-1 text-[12px] text-ink-soft">{comparison.currentLabel}: {rangeLabel(comparison.current)} · compared with {rangeLabel(comparison.previous)}</p></div>
              <div className={clsx('rounded-full border px-3 py-1.5 text-[12px] font-bold', comparedChange === null ? 'border-line-light text-ink-soft' : comparedChange > 0 ? 'border-overdue/30 bg-overdue/10 text-overdue' : 'border-moneyin/30 bg-moneyin/10 text-moneyin')}>
                {comparedChange === null ? 'Not enough previous data' : comparedChange > 0 ? `↑ ${comparedChange}% higher` : comparedChange < 0 ? `↓ ${Math.abs(comparedChange)}% lower` : 'No change'}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5">
                <div className="flex items-baseline justify-between gap-2"><p className="text-[12px] font-semibold text-ink-soft">{comparison.currentLabel}</p><p className="num text-[21px] font-display">{formatINR(comparedCurrent)}</p></div>
                <div className="meter mt-2"><span style={{ width: `${Math.max(2, comparedCurrent / compareMax * 100)}%` }} /></div>
              </div>
              <div className="rounded-xl border border-line-light bg-surface-card p-3.5">
                <div className="flex items-baseline justify-between gap-2"><p className="text-[12px] font-semibold text-ink-soft">{comparison.previousLabel}</p><p className="num text-[21px] font-display">{formatINR(comparedPrevious)}</p></div>
                <div className="meter mt-2"><span style={{ width: `${Math.max(2, comparedPrevious / compareMax * 100)}%` }} /></div>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'soft' }) {
  return (
    <div className={`rounded-xl border p-3.5 ${tone === 'primary' ? 'border-primary/30 bg-primary/5' : 'border-line-light dark:border-line-dark'}`}>
      <p className="text-[11.5px] uppercase tracking-wide text-ink-soft font-semibold">{label}</p>
      <p className="num text-[22px] font-display mt-0.5">{formatINR(value)}</p>
    </div>
  )
}
