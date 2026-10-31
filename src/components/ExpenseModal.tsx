import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CATEGORIES, METHODS, SPLIT_MODES, catOf } from '../lib/constants'
import { formatINR, parseRupeesToPaise, splitEqual, splitByPercent, paiseToInputValue } from '../lib/money'
import { compressImage } from '../lib/image'
import { useStore, useRoomData, type NewExpense } from '../hooks/useStore'
import { clearDraft, loadDraft, saveDraft } from '../hooks/usePersistentDraft'
import { Avatar } from './Avatar'
import type { Expense, SplitMode } from '../lib/types'
import clsx from 'clsx'

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }
const ease = [0.4, 0, 0.2, 1] as const

/** Amount typing stable rakho: ek decimal point + max 2 paise digits. */
function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
  const [wholeRaw = '', ...decimalParts] = cleaned.split('.')
  const whole = wholeRaw.slice(0, 9)
  if (decimalParts.length === 0) return whole
  return `${whole}.${decimalParts.join('').slice(0, 2)}`
}

interface ExpenseFormDraft {
  amount: string
  desc: string
  category: Expense['category']
  payerId: string
  method: Expense['method']
  splitMode: SplitMode
  percents: Record<string, string>
  selected: Record<string, boolean>
  photo: { dataUrl: string; kb: number } | null
  note: string
  status: 'confirmed' | 'pending'
}

interface Props { open: boolean; onClose: () => void; edit?: Expense | null }

export function ExpenseModal({ open, onClose, edit }: Props) {
  const { addExpense, updateExpense, pushToast, state, isCloudRoomActive } = useStore()
  const { members, room, me: roomMe } = useRoomData()
  const me = roomMe ?? members.find((m) => m.id === state.profile.memberId) ?? members.find((m) => m.name === state.profile.name) ?? members[0]

  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<Expense['category']>('food')
  const [payerId, setPayerId] = useState('')
  const [method, setMethod] = useState<Expense['method']>('upi')
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
  const [percents, setPercents] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [photo, setPhoto] = useState<{ dataUrl: string; kb: number } | null>(null)
  const [note, setNote] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'confirmed' | 'pending'>('confirmed')
  const [err, setErr] = useState<string | null>(null)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const submitLockedRef = useRef(false)
  const initializedSessionRef = useRef<string | null>(null)
  const draftClearedRef = useRef(false)
  const latestMembersRef = useRef(members)
  const latestMeRef = useRef(me)
  const latestRoomIdRef = useRef(room?.id ?? state.room?.id ?? 'local')

  const sharers = useMemo(
    () => members.filter((m) => (splitMode === 'subset' ? selected[m.id] : !m.isVirtual)),
    [members, splitMode, selected],
  )

  const amountPaise = parseRupeesToPaise(amount) ?? 0

  /** ⭐ LIVE split preview — largest-remainder rounding, sum hamesha exact */
  const splits = useMemo(() => {
    if (!amountPaise || sharers.length === 0) return [] as { memberId: string; paise: number }[]
    if (splitMode === 'percent') {
      const pcts = sharers.map((m) => parseFloat(percents[m.id] ?? '') || 0)
      return splitByPercent(amountPaise, pcts).map((p, i) => ({ memberId: sharers[i].id, paise: p }))
    }
    if (splitMode === 'subset' || splitMode === 'equal') {
      const per = splitEqual(amountPaise, sharers.length)
      return per.map((p, i) => ({ memberId: sharers[i].id, paise: p }))
    }
    return sharers.map((m) => ({ memberId: m.id, paise: Math.round((parseFloat(percents[m.id] ?? '') || 0) * 100) }))
  }, [amountPaise, sharers, splitMode, percents])

  const splitSum = splits.reduce((a, b) => a + b.paise, 0)
  const splitOk = splitMode !== 'exact' ? splitSum === amountPaise : splitSum === amountPaise

  // Cloud/background refresh par members/me ki object identity badal sakti hai.
  // Refs sirf latest defaults rakhte hain; form ko dobara initialize nahi karte.
  useEffect(() => { latestMembersRef.current = members }, [members])
  useEffect(() => { latestMeRef.current = me }, [me])
  useEffect(() => { latestRoomIdRef.current = room?.id ?? state.room?.id ?? 'local' }, [room?.id, state.room?.id])

  // Modal session open hone par state EK hi baar bharo.
  // Members/me ko dependency banane se background refresh ke baad yeh effect
  // dobara chalta tha aur user ka type kiya amount reset ho jaata tha.
  useEffect(() => {
    if (!open) {
      initializedSessionRef.current = null
      submitLockedRef.current = false
      setDraftHydrated(false)
      return
    }

    const roomKey = latestRoomIdRef.current
    const sessionKey = edit ? `edit:${edit.id}` : 'new'
    if (initializedSessionRef.current === `${roomKey}:${sessionKey}`) return
    initializedSessionRef.current = `${roomKey}:${sessionKey}`
    draftClearedRef.current = false

    const currentMembers = latestMembersRef.current
    const currentMe = latestMeRef.current
    const defaults: ExpenseFormDraft = edit ? {
      amount: paiseToInputValue(edit.amountPaise),
      desc: edit.description,
      category: edit.category,
      payerId: edit.payerId,
      method: edit.method,
      splitMode: edit.splitMode,
      percents: Object.fromEntries(edit.splits.map((s) => [s.memberId, paiseToInputValue(s.paise)])),
      selected: Object.fromEntries(edit.splits.map((s) => [s.memberId, true])),
      photo: edit.photoUrl ? { dataUrl: edit.photoUrl, kb: 0 } : null,
      note: edit.note ?? '',
      status: edit.status === 'pending' ? 'pending' : 'confirmed',
    } : {
      amount: '',
      desc: '',
      category: 'food',
      payerId: currentMe?.id ?? '',
      method: 'upi',
      splitMode: 'equal',
      percents: {},
      selected: Object.fromEntries(currentMembers.filter((m) => !m.isVirtual).map((m) => [m.id, true])),
      photo: null,
      note: '',
      status: 'confirmed',
    }

    const saved = loadDraft<Partial<ExpenseFormDraft> | null>(`expense.${roomKey}.${sessionKey}`, null)
    const initial: ExpenseFormDraft = {
      ...defaults,
      ...(saved ?? {}),
      selected: { ...defaults.selected, ...(saved?.selected ?? {}) },
      percents: { ...defaults.percents, ...(saved?.percents ?? {}) },
    }

    setErr(null)
    setShowPhotoPicker(false)
    setAmount(initial.amount); setDesc(initial.desc); setCategory(initial.category)
    setPayerId(initial.payerId); setMethod(initial.method); setSplitMode(initial.splitMode)
    setPercents(initial.percents); setSelected(initial.selected); setPhoto(initial.photo); setNote(initial.note); setPaymentStatus(initial.status)
    // Start persisting only after these hydrated values have committed.
    // Otherwise the persistence cleanup could briefly save the pre-init blank form.
    const readyTimer = window.setTimeout(() => setDraftHydrated(true), 0)
    return () => window.clearTimeout(readyTimer)
    // Session identity: open + expense id. Members refresh form reset nahi karega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit?.id])

  // Modal khulte waqt cloud members late aaye to sirf missing defaults bharo.
  // Amount/description/category ko yahan kabhi touch mat karo.
  useEffect(() => {
    if (!open || edit) return
    if (!payerId && me?.id) setPayerId(me.id)
    setSelected((prev) => {
      let changed = false
      const next = { ...prev }
      members.filter((m) => !m.isVirtual).forEach((m) => {
        if (!(m.id in next)) {
          next[m.id] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [open, edit, members, me?.id, payerId])

  // Persist the open form. Closing the modal, changing page, refreshing or
  // reopening the browser must not erase typed details.
  useEffect(() => {
    if (!open || !draftHydrated) return
    const sessionKey = edit ? `edit:${edit.id}` : 'new'
    if (initializedSessionRef.current !== `${room?.id ?? state.room?.id ?? 'local'}:${sessionKey}`) return
    const name = `expense.${room?.id ?? state.room?.id ?? 'local'}.${sessionKey}`
    const value: ExpenseFormDraft = { amount, desc, category, payerId, method, splitMode, percents, selected, photo, note, status: paymentStatus }
    const t = window.setTimeout(() => {
      if (!draftClearedRef.current) saveDraft(name, value)
    }, 180)
    return () => {
      window.clearTimeout(t)
      if (!draftClearedRef.current) saveDraft(name, value)
    }
  }, [open, draftHydrated, edit?.id, room?.id, state.room?.id, amount, desc, category, payerId, method, splitMode, percents, selected, photo, note, paymentStatus])

  // Focus alag rakho; already focused input par dobara focus karke mobile
  // keyboard/scroll ko jump mat karao.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      if (document.activeElement !== amountRef.current) {
        amountRef.current?.focus({ preventScroll: true })
      }
    }, 260)
    return () => window.clearTimeout(t)
  }, [open, edit?.id])

  // ⭐ smart description autocomplete — room history se
  const suggestions = useMemo(() => {
    const q = desc.trim().toLowerCase()
    if (q.length < 1) return []
    const seen = new Set<string>()
    return state.expenses
      .filter((e) => !e.deleted && e.description.toLowerCase().includes(q) && !seen.has(e.description.toLowerCase()) && seen.add(e.description.toLowerCase()))
      .slice(0, 4)
      .map((e) => ({ text: e.description, category: e.category, amountPaise: e.amountPaise }))
  }, [desc, state.expenses])

  async function onPickFile(f: File | undefined) {
    setShowPhotoPicker(false)
    if (!f) return
    if (f.size > 12 * 1024 * 1024) { pushToast({ message: 'The photo is larger than 12 MB. Please try again.', tone: 'bad' }); return }
    pushToast({ message: 'Compressing photo…', tone: 'ok' })
    const out = await compressImage(f)
    if (!out) { pushToast({ message: 'The photo could not be processed.', tone: 'bad' }); return }
    setPhoto(out)
    pushToast({ message: `Bill attached · ${out.kb} KB`, tone: 'ok' })
  }

  function submit() {
    if (submitLockedRef.current) return
    if (!me || members.length === 0) { setErr('Create a room first.'); return }
    if (!amountPaise || amountPaise <= 0) { setErr('Enter an amount, such as 250 or 250.50.'); amountRef.current?.focus(); return }
    if (sharers.length === 0) { setErr('Choose at least one person who shares this cost.'); return }
    if (!splitOk) { setErr(`The split total is ${formatINR(splitSum)}. It must match ${formatINR(amountPaise)}.`); return }
    submitLockedRef.current = true

    const draft: NewExpense = {
      description: desc.trim() || catOf(category).label,
      amountPaise, category, payerId: isCloudRoomActive ? me.id : (payerId || me.id), method, splitMode, splits,
      photoUrl: photo?.dataUrl, note: note.trim() || undefined, status: paymentStatus,
    }
    if (edit) {
      updateExpense(edit.id, { ...draft, splits: draft.splits })
      pushToast({ message: paymentStatus === 'pending' ? 'Expense saved as unpaid.' : 'Expense updated.', tone: 'ok' })
    } else {
      addExpense(draft)
      pushToast({ message: paymentStatus === 'pending' ? 'Expense saved as unpaid.' : 'Expense added successfully.', tone: 'ok' })
    }
    draftClearedRef.current = true
    clearDraft(`expense.${room?.id ?? state.room?.id ?? 'local'}.${edit ? `edit:${edit.id}` : 'new'}`)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="expense-modal"
          className="fixed inset-0 z-[120] flex items-end md:items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog" aria-modal="true" aria-label={edit ? 'Edit expense' : 'Add expense'}
            initial={window.innerWidth < 768 ? { y: '100%' } : { scale: 0.96, opacity: 0, y: 12 }}
            animate={window.innerWidth < 768 ? { y: 0 } : { scale: 1, opacity: 1, y: 0 }}
            exit={window.innerWidth < 768 ? { y: '100%' } : { scale: 0.97, opacity: 0 }}
            transition={spring}
            className="relative w-full md:max-w-lg max-h-[92dvh] overflow-y-auto scrollbar-thin rounded-t-3xl md:rounded-xl2
                       bg-white dark:bg-surface-darkcard shadow-cardHover border border-line-light dark:border-line-dark"
          >
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-surface-darkcard/95 backdrop-blur px-5 pt-4 pb-3 border-b border-line-light dark:border-line-dark flex items-center gap-3">
              <div className="md:hidden w-9 h-1 rounded-full bg-line-light dark:bg-line-dark mx-auto absolute left-1/2 -translate-x-1/2 top-2" aria-hidden="true" />
              <h2 className="flex-1 text-[18px]">{edit ? 'Edit Expense' : 'Add Expense'}</h2>
              <button type="button" onClick={onClose} className="btn-ghost !px-2.5" aria-label="Close">✕</button>
            </div>

            <div className="p-5 space-y-5">
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
                <b className="text-ink">{edit ? 'Change only the wrong details.' : 'Write one bill that somebody already paid.'}</b>{' '}
                {edit ? 'Save your changes to update the expense.' : 'RoomHisaab will split this expense and update balances after it is saved as paid.'}
              </div>

              {/* AMOUNT — sabse bada input */}
              <div>
                <label className="label" htmlFor="amt">1) How much was paid? *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-ink-soft font-display font-bold" aria-hidden="true">₹</span>
                  <input
                    id="amt" ref={amountRef} type="text" inputMode="decimal" enterKeyHint="done"
                    autoComplete="off" placeholder="0"
                    value={amount}
                    onChange={(e) => { setAmount(sanitizeAmountInput(e.target.value)); setErr(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.currentTarget.blur()
                      }
                    }}
                    className="input !pl-11 !text-[34px] !font-display !font-bold !py-3 num tracking-tight"
                    aria-describedby="amt-hint"
                  />
                </div>
                <p id="amt-hint" className="text-[12.5px] text-ink-soft mt-1.5">
                  {amountPaise > 0 ? formatINR(amountPaise) : 'You may include paise, such as 250.50.'}
                  {room && <> · {room.name}</>}
                </p>
              </div>

              {/* DESCRIPTION + autocomplete */}
              <div className="relative">
                <label className="label" htmlFor="desc">2) What was it for?</label>
                <input id="desc" className="input" placeholder="Dinner, groceries, electricity…"
                  value={desc} onChange={(e) => setDesc(e.target.value)} autoComplete="off" />
                <AnimatePresence>
                  {suggestions.length > 0 && (
                    <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute z-20 mt-1 w-full card overflow-hidden divide-y divide-line-light dark:divide-line-dark">
                      {suggestions.map((s) => (
                        <li key={s.text}>
                          <button type="button" className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-primary/10"
                            onClick={() => { setDesc(s.text); setCategory(s.category); if (!amount) setAmount(paiseToInputValue(s.amountPaise)) }}>
                            <span aria-hidden="true">{catOf(s.category).icon}</span>
                            <span className="flex-1 text-[14px] font-medium truncate">{s.text}</span>
                            <span className="num text-[13px] text-ink-soft">{formatINR(s.amountPaise)}</span>
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>

              {/* CATEGORY */}
              <div>
                <span className="label">3) Choose a simple group</span>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <motion.button key={c.id} type="button" whileTap={{ scale: 0.93 }}
                      onClick={() => setCategory(c.id)}
                      className={category === c.id ? 'chip-on' : 'chip-off'}
                      aria-pressed={category === c.id}
                      style={category === c.id ? { borderColor: c.color, color: c.color, background: `${c.color}14` } : undefined}
                    >
                      <span aria-hidden="true">{c.icon}</span>{c.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* METHOD */}
              <div>
                <span className="label">Payment method</span>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((m) => (
                    <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                      className={clsx('rounded-xl border px-3 py-3 text-center transition-all active:scale-95',
                        method === m.id ? m.cls + ' ring-2 ring-offset-1 ring-primary/30 dark:ring-offset-surface-darkcard' : 'border-line-light dark:border-line-dark text-ink-soft')}>
                      <span className="block text-xl leading-none mb-1" aria-hidden="true">{m.icon}</span>
                      <span className="text-[13px] font-bold">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">Payment status</span>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Payment status">
                  {([['confirmed','Paid'],['pending','Not Paid']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={paymentStatus===value} onClick={() => setPaymentStatus(value)} className={clsx('min-h-[44px] rounded-xl border px-3 py-3 text-[14px] font-bold',paymentStatus===value?'border-primary bg-primary/10 text-primary':'border-line-light dark:border-line-dark text-ink-soft')}>{label}</button>)}
                </div>
                {paymentStatus === 'pending' && <p className="mt-2 text-[12px] text-ink-soft">This expense will not change room balances until it is marked as paid.</p>}
              </div>

              {/* PAYER */}
              <div>
                <span className="label">Who gave the money?</span>
                {isCloudRoomActive ? (
                  <div className="flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary/10 px-3.5 py-3">
                    {me && <Avatar name={me.name} color={me.color} size={32} />}
                    <p className="flex-1 text-[12.5px] text-ink-soft"><b className="text-ink">{me?.name ?? 'You'}</b> — For cloud security, this expense is saved under your name.</p>
                    <span aria-hidden="true">🔒</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => (
                      <button key={m.id} type="button" onClick={() => setPayerId(m.id)}
                        className={payerId === m.id ? 'chip-on' : 'chip-off'} aria-pressed={payerId === m.id}>
                        <Avatar name={m.name} color={m.color} size={20} />{m.name}{m.isVirtual && ' *'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SPLIT */}
              <div>
                <span className="label">Who shares this cost, and how?</span>
                <div className="flex flex-wrap gap-2 mb-3">
                  {SPLIT_MODES.map((s) => (
                    <button key={s.id} type="button" onClick={() => {
                      setSplitMode(s.id)
                      if (s.id === 'percent') {
                        const real = members.filter((m) => !m.isVirtual)
                        const equalShare = Math.round((100 / Math.max(1, real.length)) * 100) / 100
                        // Profile me saved Default Share % ho to wahi pehle se bhar do
                        setPercents(Object.fromEntries(real.map((m) => [m.id, String(m.defaultSharePercent ?? equalShare)])))
                      }
                    }} className={splitMode === s.id ? 'chip-on' : 'chip-off'} aria-pressed={splitMode === s.id}>
                      {s.hi}
                    </button>
                  ))}
                </div>
                <p className="mb-3 rounded-xl bg-primary/10 border border-primary/15 px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
                  {splitMode === 'equal' && 'Everyone in the room pays the same share. This is best for rent, WiFi, and shared groceries.'}
                  {splitMode === 'subset' && 'Tap only the people who used this thing. Only those selected people will share the cost equally.'}
                  {splitMode === 'percent' && 'Type a percentage for each person. All percentages together should make 100%.'}
                  {splitMode === 'exact' && 'Type the exact rupee share for each person. All shares together must equal the full bill amount.'}
                </p>

                {splitMode === 'percent' && members.some((m) => m.defaultSharePercent != null) && (
                  <p className="mb-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-[12px] text-ink-soft">Saved default share percentages are pre-filled. You may change them for this expense.</p>
                )}
                {splitMode === 'subset' && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {members.filter((m) => !m.isVirtual).map((m) => (
                      <button key={m.id} type="button" onClick={() => setSelected((p) => ({ ...p, [m.id]: !p[m.id] }))}
                        className={selected[m.id] ? 'chip-on' : 'chip-off'} aria-pressed={!!selected[m.id]}>
                        <Avatar name={m.name} color={m.color} size={18} />{m.name}
                      </button>
                    ))}
                  </div>
                )}

                {sharers.length > 0 && (
                  <ul className="rounded-xl border border-line-light dark:border-line-dark divide-y divide-line-light dark:divide-line-dark overflow-hidden">
                    {sharers.map((m) => {
                      const share = splits.find((s) => s.memberId === m.id)?.paise ?? 0
                      return (
                        <li key={m.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-surface-darkcard">
                          <Avatar name={m.name} color={m.color} size={30} />
                          <span className="flex-1 text-[14px] font-semibold truncate">{m.name}</span>
                          {splitMode === 'percent' ? (
                            <span className="flex items-center gap-1">
                              <input type="number" min={0} max={100} className="input !w-20 !py-1.5 !text-right num"
                                value={percents[m.id] ?? ''} onChange={(e) => setPercents((p) => ({ ...p, [m.id]: e.target.value }))} />
                              <span className="text-ink-soft text-sm">%</span>
                            </span>
                          ) : splitMode === 'exact' ? (
                            <input type="text" inputMode="decimal" className="input !w-28 !py-1.5 !text-right num"
                              placeholder="0" value={percents[m.id] ?? ''}
                              onChange={(e) => setPercents((p) => ({ ...p, [m.id]: e.target.value.replace(/[^\d.]/g, '') }))} />
                          ) : (
                            <span className="num text-[15px] text-primary">{formatINR(share)}</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {amountPaise > 0 && (
                  <p className={clsx('text-[12.5px] mt-2 font-medium', splitOk ? 'text-moneyin' : 'text-overdue')}>
                    {splitOk ? `Shares add up to ${formatINR(splitSum)} — the full bill is divided correctly.`
                             : `Shares currently add up to ${formatINR(splitSum)}, but the bill is ${formatINR(amountPaise)}. Difference: ${formatINR(Math.abs(amountPaise - splitSum))}.`}
                  </p>
                )}
              </div>

              {/* PHOTO */}
              <div>
                <span className="label">Bill photo (optional proof)</span>
                {!photo ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}>📁 Gallery</button>
                    <button type="button" className="btn-outline" onClick={() => setShowPhotoPicker(true)}>Camera</button>
                    {showPhotoPicker && (
                      <div className="col-span-2 card p-3 text-[13px] text-ink-soft">
                        Use the button below to open the camera. The photo will be compressed to under 300 KB.
                        <button type="button" className="btn-primary mt-2 w-full"
                          onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = () => onPickFile(i.files?.[0]); i.click() }}>
                          Open camera
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 card p-2.5">
                    <img src={photo.dataUrl} alt="Bill preview" className="h-16 w-16 rounded-lg object-cover bg-black/5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold truncate">Bill attached</p>
                      <p className="text-[12px] text-ink-soft">{photo.kb ? `${photo.kb}KB · compressed WebP` : 'saved'}</p>
                    </div>
                    <button type="button" className="btn-ghost !px-2.5" onClick={() => setPhoto(null)} aria-label="Remove photo">🗑</button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0])} />
              </div>

              {/* NOTE */}
              <div>
                <label className="label" htmlFor="note">Extra note (optional)</label>
                <input id="note" className="input" placeholder="Add a short note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              {err && <p className="text-[13.5px] font-semibold text-overdue bg-overdue/10 border border-overdue/25 rounded-xl px-3 py-2" role="alert">{err}</p>}
            </div>

            {/* ACTION BAR */}
            <div className="sticky bottom-0 bg-white/95 dark:bg-surface-darkcard/95 backdrop-blur border-t border-line-light dark:border-line-dark px-5 py-3.5 flex gap-2" style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom,0px))' }}>
              <button type="button" className="btn-outline flex-1" onClick={onClose}>Cancel</button>
              <motion.button type="button" whileTap={{ scale: 0.97 }} className="btn-primary flex-[2]" onClick={submit}>
                {edit ? 'Save Changes' : paymentStatus === 'pending' ? 'Save as Unpaid' : 'Save Expense'} {amountPaise > 0 && <span className="num">· {formatINR(amountPaise)}</span>}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
