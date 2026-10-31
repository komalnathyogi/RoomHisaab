import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, useRoomData } from '../hooks/useStore'
import { cycleRangeForRoom } from '../lib/balances'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { catOf, CATEGORIES, METHODS } from '../lib/constants'
import { formatINR } from '../lib/money'
import { ExpenseCard } from '../components/ExpenseCard'
import { ExpenseModal } from '../components/ExpenseModal'
import { PageHead } from '../components/Layout'
import { EmptyState } from '../components/EmptyState'
import { expensesToCSV, download } from '../lib/csv'
import type { Expense } from '../lib/types'
import { Icon } from '../components/Icon'
import clsx from 'clsx'

type SortKey = 'new' | 'old' | 'high' | 'low'

export default function Expenses() {
  const { state, deleteExpense, reactExpense, pushToast, canEditExpense, deletedExpenses, restoreDeletedExpense } = useStore()
  const { room, members, expenses, me } = useRoomData()
  const [q, setQ] = usePersistentState('history.q', '')
  const [memberFilter, setMemberFilter] = usePersistentState<string>('history.member', 'all')
  const [catFilter, setCatFilter] = usePersistentState<string>('history.category', 'all')
  const [methodFilter, setMethodFilter] = usePersistentState<string>('history.method', 'all')
  const [range, setRange] = usePersistentState<'cycle' | 'month' | 'all'>('history.range', 'all')
  const [sort, setSort] = usePersistentState<SortKey>('history.sort', 'new')
  const [editing, setEditing] = useState<Expense | null>(null)
  const [filtersOpen, setFiltersOpen] = usePersistentState('history.filtersOpen', false)
  const [limit, setLimit] = useState(30)

  const cycle = useMemo(() => cycleRangeForRoom(room), [room])
  const roomTrash = useMemo(() => deletedExpenses.filter((item) => item.expense.roomId === room?.id).sort((a, b) => b.deletedAt - a.deletedAt), [deletedExpenses, room?.id])

  const filtered = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const fromTs = range === 'cycle' ? cycle.start : range === 'month' ? monthStart : 0
    const toTs = range === 'cycle' ? cycle.end : Number.MAX_SAFE_INTEGER
    const needle = q.trim().toLowerCase()

    const list = expenses.filter((e) => {
      if (e.deleted) return false
      if (e.createdAt < fromTs || e.createdAt > toTs) return false
      if (memberFilter !== 'all' && e.payerId !== memberFilter && !e.splits.some((s) => s.memberId === memberFilter)) return false
      if (catFilter !== 'all' && e.category !== catFilter) return false
      if (methodFilter !== 'all' && e.method !== methodFilter) return false
      if (needle && !(`${e.description} ${catOf(e.category).label}`.toLowerCase().includes(needle))) return false
      return true
    })
    const sorted = [...list]
    const stableTie = (a: Expense, b: Expense) => (b.updatedAt - a.updatedAt) || a.id.localeCompare(b.id)
    if (sort === 'new') sorted.sort((a, b) => (b.createdAt - a.createdAt) || stableTie(a, b))
    if (sort === 'old') sorted.sort((a, b) => (a.createdAt - b.createdAt) || a.id.localeCompare(b.id))
    if (sort === 'high') sorted.sort((a, b) => (b.amountPaise - a.amountPaise) || stableTie(a, b))
    if (sort === 'low') sorted.sort((a, b) => (a.amountPaise - b.amountPaise) || stableTie(a, b))
    return sorted
  }, [expenses, q, memberFilter, catFilter, methodFilter, range, sort, cycle.start])

  /** sticky month headers ke liye group */
  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of filtered) {
      const key = new Date(e.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return [...map.entries()]
  }, [filtered])

  const groupTotal = (list: Expense[]) => list.reduce((a, b) => a + b.amountPaise, 0)
  const activeFilters = [memberFilter, catFilter, methodFilter].filter((f) => f !== 'all').length + (range !== 'all' ? 1 : 0)

  function exportCSV() {
    download(`roomhisaab-history-${new Date().toISOString().slice(0, 10)}.csv`, expensesToCSV(filtered, members), 'text/csv;charset=utf-8')
    pushToast({ message: `CSV downloaded · ${filtered.length} expenses`, tone: 'ok' })
  }

  return (
    <>
      <PageHead title="Expenses" sub={`All room expenses · ${filtered.length} shown · ${formatINR(groupTotal(filtered))}`}
        right={<button className="btn-outline !px-3.5" onClick={exportCSV}><Icon name="download" size={17} /> CSV export</button>} />

      {roomTrash.length > 0 && (
        <section className="card mb-4 overflow-hidden border border-accent/25" aria-labelledby="recently-deleted-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-light bg-accent/5 px-4 py-3">
            <div>
              <h2 id="recently-deleted-title" className="text-[16px]">Recently deleted</h2>
              <p className="text-[12px] text-ink-soft">This device keeps deleted expenses here for 30 days. Restore one if it was removed by mistake.</p>
            </div>
            <span className="badge-warn rounded-full px-2.5 py-1 text-[11px] font-bold">{roomTrash.length} saved</span>
          </div>
          <ul className="divide-y divide-line-light">
            {roomTrash.map(({ expense, deletedAt }) => (
              <li key={expense.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="icon-tile h-10 w-10"><Icon name="receipt" size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{expense.description}</p>
                  <p className="text-[11.5px] text-ink-soft">{formatINR(expense.amountPaise)} · deleted {new Date(deletedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <button type="button" className="btn-outline !min-h-[40px] !px-3.5" onClick={() => restoreDeletedExpense(expense.id)}><Icon name="arrowRight" size={16} /> Restore</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CLEAN FILTER TOOLBAR — advanced filters ek tap peeche */}
      <div className="card p-3.5 sm:p-4 mb-5">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_210px_auto] gap-2.5">
          <div className="relative">
            <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input id="history-search" className="input !pl-11" placeholder="Search an item or bill" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expenses" />
          </div>
          <div>
            <label className="sr-only" htmlFor="history-sort">Sort order</label>
            <select id="history-sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              <option value="high">Amount: high to low</option>
              <option value="low">Amount: low to high</option>
            </select>
          </div>
          <button type="button" onClick={() => setFiltersOpen((v) => !v)} className={filtersOpen ? 'btn-primary' : 'btn-outline'} aria-expanded={filtersOpen}>
            <Icon name="settings" size={18} /> Filters
            {activeFilters > 0 && <span className="badge-alert grid place-items-center min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold">{activeFilters}</span>}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint mr-1">Show</span>
          {([['cycle', 'This cycle'], ['month', 'This month'], ['all', 'All dates']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} className={range === k ? 'chip-on' : 'chip-off'} aria-pressed={range === k}>{l}</button>
          ))}
          <span className="flex-1" />
          {(activeFilters > 0 || q) && (
            <button className="btn-ghost !px-3 !text-[13px]" onClick={() => { setMemberFilter('all'); setCatFilter('all'); setMethodFilter('all'); setRange('all'); setQ('') }}>
              <Icon name="x" size={16} /> Clear all
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .25, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
              <div className="pt-4 mt-4 border-t border-line-light space-y-4">
                <div>
                  <span className="label">Member</span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setMemberFilter('all')} className={memberFilter === 'all' ? 'chip-on' : 'chip-off'}>All members</button>
                    {members.map((m) => (
                      <button key={m.id} onClick={() => setMemberFilter(memberFilter === m.id ? 'all' : m.id)}
                        className={memberFilter === m.id ? 'chip-on' : 'chip-off'} aria-pressed={memberFilter === m.id}>{m.name}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="label">Category</span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setCatFilter('all')} className={catFilter === 'all' ? 'chip-on' : 'chip-off'}>All categories</button>
                    {CATEGORIES.map((c) => (
                      <button key={c.id} onClick={() => setCatFilter(catFilter === c.id ? 'all' : c.id)}
                        className={catFilter === c.id ? 'chip-on' : 'chip-off'} aria-pressed={catFilter === c.id}
                        style={catFilter === c.id ? { borderColor: c.color, color: c.color } : undefined}>
                        <span aria-hidden="true">{c.icon}</span>{c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="label">Payment method</span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setMethodFilter('all')} className={methodFilter === 'all' ? 'chip-on' : 'chip-off'}>All methods</button>
                    {METHODS.map((m) => (
                      <button key={m.id} onClick={() => setMethodFilter(methodFilter === m.id ? 'all' : m.id)}
                        className={clsx(methodFilter === m.id ? 'chip-on' : 'chip-off')} aria-pressed={methodFilter === m.id}>
                        <span aria-hidden="true">{m.icon}</span>{m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {filtered.length === 0 ? (
        <EmptyState emoji="🔍" title="No results"
          body={q ? `No saved expense matches "${q}". Check the spelling or clear the filters.` : 'No saved expenses in this time period. Choose All dates or add a purchase from Add Expense.'} />
      ) : (
        <div className="space-y-6">
          {groups.map(([label, list]) => (
            <section key={label}>
              <div className="sticky top-[72px] z-20 -mx-1 px-1 py-2 bg-surface-page/90 dark:bg-surface-dark/90 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-display">{label}</h2>
                  <span className="num text-[13px] text-ink-soft">{formatINR(groupTotal(list))} · {list.length}</span>
                </div>
              </div>
              <ul className="space-y-2.5 mt-1">
                <AnimatePresence initial={false}>
                  {list.slice(0, limit).map((e, i) => (
                    <ExpenseCard key={e.id} e={e} members={members} index={i} meId={me?.id} canEdit={canEditExpense(e, me?.id)}
                      onEdit={setEditing} onDelete={deleteExpense}
                      onReact={(id, emoji) => me && reactExpense(id, emoji, me.id)} />
                  ))}
                </AnimatePresence>
              </ul>
              {list.length > limit && (
                <button className="btn-outline w-full mt-3" onClick={() => setLimit((l) => l + 30)}>
                  Load {Math.min(30, list.length - limit)} more ({list.length - limit} remaining)
                </button>
              )}
            </section>
          ))}
        </div>
      )}

      <ExpenseModal open={!!editing} edit={editing} onClose={() => setEditing(null)} />
      <p className="sr-only" aria-live="polite">Showing {filtered.length} of {state.expenses.length} expenses</p>
    </>
  )
}
