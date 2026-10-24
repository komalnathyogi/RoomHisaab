import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, useRoomData } from '../hooks/useStore'
import { usePersistentState } from '../hooks/usePersistentDraft'
import { CATEGORIES, catOf } from '../lib/constants'
import { formatINR, parseRupeesToPaise, paiseToInputValue } from '../lib/money'
import { uid } from '../lib/id'
import { PageHead } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import type { CategoryId, Method, SplitMode } from '../lib/types'
import { Icon } from '../components/Icon'
import clsx from 'clsx'

const ease = [0.4, 0, 0.2, 1] as const

/**
 * ⭐ AUTOMATION CENTER
 * 1) Recurring — rent/WiFi har month khud add
 * 2) Rules — "IF merchant X THEN category/split Y"
 * 3) Merchant memory — app khud seekh raha hai
 */
export default function Rules() {
  const { state, upsertRecurring, toggleRecurring, deleteRecurring, upsertRule, toggleRule, deleteRule, runDueRecurring, pushToast } = useStore()
  const { room, members } = useRoomData()

  // recurring form
  const [recDesc, setRecDesc] = usePersistentState('rules.recurring.description', '')
  const [recAmt, setRecAmt] = usePersistentState('rules.recurring.amount', '')
  const [recCat, setRecCat] = usePersistentState<CategoryId>('rules.recurring.category', 'rent')
  const [recDay, setRecDay] = usePersistentState('rules.recurring.day', 5)
  const [recPayer, setRecPayer] = usePersistentState('rules.recurring.payer', '')
  const [recMethod, setRecMethod] = usePersistentState<Method>('rules.recurring.method', 'upi')

  // rule form
  const [ruleMerchant, setRuleMerchant] = usePersistentState('rules.rule.merchant', '')
  const [ruleCat, setRuleCat] = usePersistentState<CategoryId>('rules.rule.category', 'food')
  const [ruleSplit, setRuleSplit] = usePersistentState<SplitMode>('rules.rule.splitMode', 'equal')
  const [ruleBelow, setRuleBelow] = usePersistentState('rules.rule.belowAmount', '')

  const merchants = useMemo(() => [...state.merchants].sort((a, b) => b.hits - a.hits), [state.merchants])
  const recPaise = parseRupeesToPaise(recAmt) ?? 0

  function addRecurring() {
    if (!recDesc.trim()) { pushToast({ message: 'Enter a name, such as Rent or WiFi.', tone: 'bad' }); return }
    if (!recPaise) { pushToast({ message: 'Enter an amount.', tone: 'bad' }); return }
    const payer = recPayer || members[0]?.id
    if (!payer) { pushToast({ message: 'Create a room and member first.', tone: 'bad' }); return }
    upsertRecurring({
      id: uid('rec_'), roomId: room?.id ?? 'local', description: recDesc.trim(),
      category: recCat, amountPaise: recPaise, payerId: payer,
      splitMode: 'equal', dayOfMonth: Math.min(Math.max(recDay, 1), 28),
      method: recMethod, active: true,
    })
    pushToast({ message: `"${recDesc.trim()}" will be added on day ${recDay} each month.`, tone: 'ok' })
    setRecDesc(''); setRecAmt('')
  }

  function addRule() {
    const m = ruleMerchant.trim()
    if (!m) { pushToast({ message: 'Enter a shop or service name, such as Zomato or BigBasket.', tone: 'bad' }); return }
    const below = parseRupeesToPaise(ruleBelow)
    upsertRule({
      id: uid('rl_'), roomId: room?.id ?? 'local',
      label: `${m} ${below ? `(below ₹${paiseToInputValue(below)}) ` : ''}→ ${catOf(ruleCat).label} · ${ruleSplit === 'equal' ? 'equal split' : ruleSplit === 'subset' ? 'selected members' : ruleSplit}`,
      when: { merchantContains: m.toUpperCase(), amountBelowPaise: below ?? undefined },
      then: { category: ruleCat, splitMode: ruleSplit },
      active: true,
    })
    pushToast({ message: `Rule created for ${m}.`, tone: 'ok' })
    setRuleMerchant(''); setRuleBelow('')
  }

  return (
    <>
      <PageHead title="Automation" sub="Set repeated bills and shortcuts once; RoomHisaab prepares them later"
        right={<button className="btn-primary !px-3.5" onClick={() => {
          const n = runDueRecurring()
          pushToast({ message: n ? `${n} recurring expense(s) added.` : 'Recurring expenses for this month are already added.', tone: n ? 'ok' : 'warn' })
        }}><Icon name="bolt" size={17} /> Run recurring now</button>} />


      <section className="grid grid-cols-3 gap-3 mb-4" aria-label="Automation summary">
        <div className="card p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Monthly auto-add</p><p className="num font-display text-[20px] sm:text-[25px] mt-1.5">{formatINR(state.recurring.filter((r) => r.active).reduce((sum, r) => sum + r.amountPaise, 0))}</p><p className="text-[11.5px] text-ink-soft">{state.recurring.filter((r) => r.active).length} active bills</p></div>
        <div className="card p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Smart rules</p><p className="num font-display text-[20px] sm:text-[25px] mt-1.5">{state.rules.filter((r) => r.active).length}</p><p className="text-[11.5px] text-ink-soft">automatic category and split</p></div>
        <div className="card p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Shops remembered</p><p className="num font-display text-[20px] sm:text-[25px] mt-1.5">{merchants.length}</p><p className="text-[11.5px] text-ink-soft">learned from past bills</p></div>
      </section>
      {/* ── RECURRING ── */}
      <SectionCard className="mb-4" title="Recurring expenses" sub="Rent, electricity, WiFi and other monthly bills">
        {state.recurring.length === 0 ? (
          <p className="text-[13.5px] text-ink-soft py-2">No recurring expenses yet. Add the first one below.</p>
        ) : (
          <ul className="space-y-2.5 mb-4">
            <AnimatePresence initial={false}>
              {state.recurring.map((r, i) => {
                const cat = catOf(r.category)
                const payer = members.find((m) => m.id === r.payerId)
                return (
                  <motion.li key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }}
                    transition={{ duration: .28, delay: Math.min(i * .04, .3), ease }}
                    className="card !shadow-none p-3 flex flex-wrap items-center gap-3">
                    <span className="grid place-items-center h-11 w-11 rounded-xl text-xl" style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}33` }} aria-hidden="true">{cat.icon}</span>
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-semibold text-[14.5px] leading-tight">{r.description} <span className="num text-primary">{formatINR(r.amountPaise)}</span></p>
                      <p className="text-[12px] text-ink-soft mt-0.5">
                        Every month on day <b>{r.dayOfMonth}</b> · {payer ? `Paid by ${payer.name}` : ''} · {r.method.toUpperCase()}
                        {r.lastRunKey ? ` · last added: ${r.lastRunKey}` : ''}
                      </p>
                    </div>
                    <Toggle on={r.active} onClick={() => toggleRecurring(r.id)} label={`${r.description} recurring`} />
                    <button className="btn-danger !px-3 !py-1.5 !text-[13px]" onClick={() => { deleteRecurring(r.id); pushToast({ message: 'Recurring expense removed.', tone: 'warn' }) }} aria-label="Delete"><Icon name="x" size={16} /></button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}

        <div className="pt-4 border-t border-line-light dark:border-line-dark grid sm:grid-cols-2 gap-3">
          <div><label className="label" htmlFor="rec-name">Bill name</label><input id="rec-name" className="input" placeholder="Rent / WiFi / Maid" value={recDesc} onChange={(e) => setRecDesc(e.target.value)} /></div>
          <div><label className="label" htmlFor="rec-amount">Monthly amount</label><div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft font-bold" aria-hidden="true">₹</span>
            <input id="rec-amount" className="input !pl-8 num" placeholder="18000" inputMode="decimal" value={recAmt} onChange={(e) => setRecAmt(e.target.value.replace(/[^\d.]/g, ''))} />
          </div></div>
          <select className="input" value={recCat} onChange={(e) => setRecCat(e.target.value as CategoryId)} aria-label="Category">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-soft whitespace-nowrap">Day:</span>
            <input type="number" min={1} max={28} className="input num" value={recDay}
              onChange={(e) => setRecDay(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 28))} aria-label="Day of month" />
          </div>
          <select className="input" value={recPayer} onChange={(e) => setRecPayer(e.target.value)} aria-label="Payer">
            <option value="">Who pays? (first member by default)</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="flex gap-2">
            {(['upi', 'cash', 'card'] as const).map((m) => (
              <button key={m} onClick={() => setRecMethod(m)} className={clsx('flex-1 rounded-xl border py-2.5 font-bold text-[13px] transition-all active:scale-95',
                recMethod === m ? 'border-primary bg-primary/10 text-primary' : 'border-line-light dark:border-line-dark text-ink-soft')}>
                {m === 'cash' ? 'Cash' : m === 'upi' ? 'UPI' : 'Card'}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full mt-3" onClick={addRecurring}><Icon name="plus" size={17} /> Create recurring expense {recPaise > 0 && `· ${formatINR(recPaise)}/month`}</button>
      </SectionCard>

      {/* ── RULES ── */}
      <SectionCard className="mb-4" title="Smart rules" sub="Example: a Zomato bill below ₹400 uses Food and selected members">
        {state.rules.length === 0 ? (
          <p className="text-[13.5px] text-ink-soft py-2">No rules yet. Rules pre-fill category and split for Auto Capture entries.</p>
        ) : (
          <ul className="space-y-2.5 mb-4">
            <AnimatePresence initial={false}>
              {state.rules.map((r, i) => (
                <motion.li key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }}
                  transition={{ duration: .28, delay: Math.min(i * .04, .3), ease }}
                  className="card !shadow-none p-3 flex flex-wrap items-center gap-3">
                  <span className="icon-tile h-11 w-11"><Icon name="bolt" size={21} /></span>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-[14px] leading-tight">{r.label}</p>
                    <p className="text-[12px] leading-relaxed text-ink-soft mt-0.5">
                      If the shop name contains “{r.when.merchantContains ?? 'any shop'}”{r.when.amountBelowPaise ? ` and the amount is below ₹${paiseToInputValue(r.when.amountBelowPaise)}` : ''}, use {r.then.category ? catOf(r.then.category).label : 'the usual category'} and {r.then.splitMode === 'equal' ? 'share equally' : r.then.splitMode === 'subset' ? 'selected members only' : r.then.splitMode === 'percent' ? 'split by percent' : r.then.splitMode === 'exact' ? 'exact amounts' : 'the usual split'}.
                    </p>
                  </div>
                  <Toggle on={r.active} onClick={() => toggleRule(r.id)} label={`Rule ${r.label}`} />
                  <button className="btn-danger !px-3 !py-1.5 !text-[13px]" onClick={() => { deleteRule(r.id); pushToast({ message: 'Rule removed.', tone: 'warn' }) }} aria-label="Delete"><Icon name="x" size={16} /></button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className="pt-4 border-t border-line-light dark:border-line-dark grid sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Shop name — Zomato, Swiggy…" value={ruleMerchant}
            onChange={(e) => setRuleMerchant(e.target.value)} aria-label="Shop or service name" />
          <input className="input num" placeholder="Only below this ₹ amount" inputMode="decimal" value={ruleBelow}
            onChange={(e) => setRuleBelow(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Amount below" />
          <select className="input" value={ruleCat} onChange={(e) => setRuleCat(e.target.value as CategoryId)} aria-label="Rule category">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          <select className="input" value={ruleSplit} onChange={(e) => setRuleSplit(e.target.value as SplitMode)} aria-label="Rule split">
            <option value="equal">Split: Equal</option>
            <option value="subset">Split: Selected members</option>
            <option value="percent">Split: By percent</option>
            <option value="exact">Split: Exact amount</option>
          </select>
        </div>
        <button className="btn-primary w-full mt-3" onClick={addRule}><Icon name="plus" size={17} /> Create rule</button>
        <p className="text-[12px] text-ink-soft mt-3">
          When a shop name from Auto Capture matches, its category and split are filled automatically.
        </p>
      </SectionCard>

      {/* ── MERCHANT MEMORY ── */}
      <SectionCard title="What the app has learned" sub="Shops and categories remembered from expenses you confirmed">
        {merchants.length === 0 ? (
          <EmptyState emoji="🧠" title="Nothing learned yet"
            body="Confirm Auto Capture entries or add expenses with shop names. RoomHisaab will remember their category and split." />
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5">
            {merchants.map((m) => {
              const cat = m.defaultCategory ? catOf(m.defaultCategory) : null
              return (
                <li key={m.key} className="rounded-xl border border-line-light dark:border-line-dark p-3 flex items-center gap-3">
                  <span className="grid place-items-center h-10 w-10 rounded-xl text-lg shrink-0"
                    style={{ background: `${cat?.color ?? '#4F46C8'}18`, border: `1px solid ${cat?.color ?? '#4F46C8'}33` }} aria-hidden="true">
                    {cat?.icon ?? '🏪'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[14px] leading-tight truncate">{m.displayName}</p>
                    <p className="text-[12px] text-ink-soft truncate">
                      {cat ? `${cat.label}` : 'Category ?'} · {m.defaultSplitMode === 'equal' ? 'equal split' : m.defaultSplitMode ?? 'split ?'} · {m.hits} times
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {members.length > 0 && (
          <div className="flex -space-x-2 mt-4">
            {members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} color={m.color} size={26} ring />)}
            <span className="text-[12.5px] text-ink-soft ml-4 self-center">Rules apply across {members.length} members</span>
          </div>
        )}
      </SectionCard>
    </>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on} aria-label={label} title={on ? 'On — select to turn off' : 'Off — select to turn on'}
      className="relative grid h-11 w-14 min-h-[44px] shrink-0 place-items-center rounded-full">
      <span className={clsx('relative h-7 w-12 rounded-full transition-colors', on ? 'bg-primary' : 'bg-black/15 dark:bg-white/15')}>
        <motion.span layout className={clsx('absolute top-1 h-5 w-5 rounded-full bg-white shadow', on ? 'left-6' : 'left-1')} transition={{ duration: .18, ease }} />
      </span>
    </button>
  )
}
