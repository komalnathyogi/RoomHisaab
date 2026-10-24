import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { useRoomData, useStore } from '../hooks/useStore'
import { clearDraft, loadDraft, usePersistentState } from '../hooks/usePersistentDraft'
import { PageHead } from '../components/Layout'
import { SectionCard } from '../components/SectionCard'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { CATEGORIES } from '../lib/constants'
import { formatINR, paiseToInputValue, parseRupeesToPaise, splitEqual } from '../lib/money'
import { buildUpiLaunchLink, buildUpiLink, isValidVpa, parseUpiQr, upiQrPayload, UPI_APPS, type ParsedUpiQr } from '../lib/upi'
import {
  clearPendingInstantPurchase,
  isInstantPayReturnReady,
  loadPendingInstantPurchase,
  savePendingInstantPurchase,
  type InstantPurchaseDraft,
  type InstantPurchaseIntent,
} from '../lib/instantPay'
import type { CategoryId, Method, UpiApp } from '../lib/types'
import clsx from 'clsx'

type PaymentTiming = 'now' | 'already'
type SplitChoice = 'equal' | 'personal' | 'selected'

function toDateInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
  const [wholeRaw = '', ...decimalParts] = cleaned.split('.')
  const whole = wholeRaw.slice(0, 9)
  if (decimalParts.length === 0) return whole
  return `${whole}.${decimalParts.join('').slice(0, 2)}`
}

export default function QuickBuy() {
  const navigate = useNavigate()
  const { addExpense, deleteExpense, pushToast, loadDemo, isCloudRoomActive } = useStore()
  const { room, members, me } = useRoomData()

  // Draft fields survive page changes, refresh and browser restart.
  const [item, setItem, clearItemDraft] = usePersistentState('quickbuy.item.v2', () => loadDraft<string>('quickbuy.item', '').trim() || 'Sabji')
  const [amount, setAmount, clearAmountDraft] = usePersistentState('quickbuy.amount', '')
  const [category, setCategory] = usePersistentState<CategoryId>('quickbuy.category', 'shopping')
  const [payerId, setPayerId] = usePersistentState('quickbuy.payerId', '')
  const [method, setMethod] = usePersistentState<Method>('quickbuy.method', 'upi')
  const [paymentTiming, setPaymentTiming] = usePersistentState<PaymentTiming>('quickbuy.paymentTiming', 'now')
  const [splitChoice, setSplitChoice] = usePersistentState<SplitChoice>('quickbuy.splitChoice', 'equal')
  const [selected, setSelected] = usePersistentState<Record<string, boolean>>('quickbuy.selected', {})
  const [expenseDate, setExpenseDate, clearDateDraft] = usePersistentState('quickbuy.date', () => toDateInput(new Date()))
  const [payeeName, setPayeeName, clearPayeeNameDraft] = usePersistentState('quickbuy.payeeName', '')
  const [payeeVpa, setPayeeVpa, clearPayeeVpaDraft] = usePersistentState('quickbuy.payeeVpa', '')
  const [upiApp, setUpiApp] = usePersistentState<UpiApp>('quickbuy.upiApp', () => me?.preferredUpiApp ?? 'any')
  const [moreOpen, setMoreOpen] = usePersistentState('quickbuy.moreOpen', false)
  const [autoAddOnReturn, setAutoAddOnReturn] = usePersistentState('quickbuy.autoAddOnReturn', false)

  const [pendingIntent, setPendingIntent] = useState<InstantPurchaseIntent | null>(() => loadPendingInstantPurchase())
  const [returnPrompt, setReturnPrompt] = useState(false)
  const [payOpened, setPayOpened] = useState(false)
  const [error, setError] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const [scanPhase, setScanPhase] = useState<'scanning' | 'success'>('scanning')
  const [scannedSeller, setScannedSeller] = useState<ParsedUpiQr | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null)
  const scanTimerRef = useRef<number | undefined>(undefined)
  const finishingIntentRef = useRef('')
  const returnTimerRef = useRef<number | undefined>(undefined)
  const scanAutoLaunchRef = useRef<number | undefined>(undefined)
  const scanCloseTimerRef = useRef<number | undefined>(undefined)
  const scanLockedRef = useRef(false)

  const realMembers = useMemo(() => members.filter((m) => !m.isVirtual), [members])
  const realIds = realMembers.map((m) => m.id).join(',')
  const isSolo = realMembers.length === 1
  const amountPaise = parseRupeesToPaise(amount) ?? 0
  const payer = isCloudRoomActive
    ? (me ?? realMembers[0])
    : (members.find((m) => m.id === payerId) ?? me ?? realMembers[0])
  const alreadyPaid = paymentTiming === 'already'

  useEffect(() => {
    if (me && (!payerId || (isCloudRoomActive && payerId !== me.id))) setPayerId(me.id)
  }, [payerId, me, isCloudRoomActive, setPayerId])

  useEffect(() => {
    if (me?.preferredUpiApp) setUpiApp(me.preferredUpiApp)
  }, [me?.id, me?.preferredUpiApp, setUpiApp])

  useEffect(() => { clearDraft('quickbuy.item') }, [])

  useEffect(() => {
    if (!realMembers.length) return
    setSelected((prev) => {
      const hasCurrentRoomMember = realMembers.some((m) => m.id in prev)
      return hasCurrentRoomMember ? prev : Object.fromEntries(realMembers.map((m) => [m.id, true]))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realIds])

  useEffect(() => () => {
    window.clearTimeout(scanTimerRef.current)
    window.clearTimeout(returnTimerRef.current)
    window.clearTimeout(scanAutoLaunchRef.current)
    window.clearTimeout(scanCloseTimerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    scannerControlsRef.current?.stop()
  }, [])

  const sharers = useMemo(() => {
    if (realMembers.length === 1) return payer ? [payer] : []
    if (splitChoice === 'personal') return payer ? [payer] : []
    if (splitChoice === 'selected') return realMembers.filter((m) => selected[m.id])
    return realMembers
  }, [splitChoice, payer, realMembers, selected])

  const splits = useMemo(() => {
    if (!amountPaise || !sharers.length) return []
    return splitEqual(amountPaise, sharers.length).map((paise, i) => ({ memberId: sharers[i].id, paise }))
  }, [amountPaise, sharers])

  const vpaValid = isValidVpa(payeeVpa)
  const upiPayload = useMemo(() => ({
    payeeVpa,
    payeeName: payeeName.trim() || 'Shop',
    amountPaise,
    note: item.trim() ? `RoomHisaab: ${item.trim()}` : 'RoomHisaab Quick Buy',
  }), [payeeVpa, payeeName, amountPaise, item])
  const directLink = !alreadyPaid && amountPaise > 0 ? buildUpiLaunchLink({ ...upiPayload, app: upiApp }) : null
  const qrPayload = !alreadyPaid && amountPaise > 0 ? upiQrPayload(upiPayload) : null

  function stopCamera() {
    window.clearTimeout(scanTimerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    scannerControlsRef.current?.stop()
    scannerControlsRef.current = null
  }

  function stopScanner() {
    window.clearTimeout(scanAutoLaunchRef.current)
    window.clearTimeout(scanCloseTimerRef.current)
    stopCamera()
    setScannerOpen(false)
    setScanPhase('scanning')
  }

  function handleScanned(raw: string) {
    const parsed = parseUpiQr(raw)
    if (!parsed) {
      setScanMsg('This QR does not contain a readable UPI ID. Try another seller QR or enter the UPI ID below.')
      return
    }
    if (scanLockedRef.current) return
    scanLockedRef.current = true
    setScannedSeller(parsed)
    setScanPhase('success')
    stopCamera()
    setPayeeVpa(parsed.payeeVpa)
    setPayeeName(parsed.payeeName)
    setMethod('upi')
    setPaymentTiming('now')

    const effectiveAmount = parsed.amountPaise ?? amountPaise
    if (parsed.amountPaise && amountPaise && parsed.amountPaise !== amountPaise) {
      setAmount(paiseToInputValue(parsed.amountPaise))
      setScanMsg(`Seller QR amount is ${formatINR(parsed.amountPaise)}, but the form has ${formatINR(amountPaise)}. Check the amount before paying.`)
      scanCloseTimerRef.current = window.setTimeout(() => setScannerOpen(false), 1800)
      return
    }
    if (parsed.amountPaise && !amountPaise) setAmount(paiseToInputValue(parsed.amountPaise))
    if (!effectiveAmount || !item.trim() || !payer) {
      setScanMsg(!effectiveAmount ? `Seller found: ${parsed.payeeName}. Add the purchase amount to continue.` : 'Seller details found. Check the purchase details to continue.')
      scanCloseTimerRef.current = window.setTimeout(() => setScannerOpen(false), 1500)
      return
    }

    const note = item.trim() ? `RoomHisaab: ${item.trim()}` : 'RoomHisaab Quick Buy'
    const launchLink = buildUpiLaunchLink({
      payeeVpa: parsed.payeeVpa,
      payeeName: parsed.payeeName,
      amountPaise: effectiveAmount,
      note,
      app: upiApp,
    })
    const draft = buildPurchaseDraft(effectiveAmount, parsed, true)
    if (!launchLink || !draft) {
      setScanMsg('Seller details found. Check the amount and payment details before continuing.')
      scanCloseTimerRef.current = window.setTimeout(() => setScannerOpen(false), 1500)
      return
    }
    const appName = UPI_APPS.find((app) => app.id === upiApp)?.label ?? 'UPI app'
    setScanMsg(`Seller found: ${parsed.payeeName}. Opening ${appName}…`)
    scanAutoLaunchRef.current = window.setTimeout(() => {
      setScannerOpen(false)
      launchInstantPay(launchLink, draft)
    }, 1100)
  }

  async function startScanner() {
    setScanMsg('')
    setScannedSeller(null)
    setScanPhase('scanning')
    scanLockedRef.current = false
    setError('')
    const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> } }).BarcodeDetector
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanMsg('Camera access is not available here. Open your UPI app and scan the seller QR, or enter the seller UPI ID.')
      return
    }

    if (!DetectorCtor) {
      // Use a small on-demand QR decoder on browsers without BarcodeDetector.
      // This avoids asking users to give up just because their phone browser is older.
      setScannerOpen(true)
      window.setTimeout(() => {
        void (async () => {
          try {
            const video = videoRef.current
            if (!video) return
            const { BrowserQRCodeReader } = await import('@zxing/browser')
            const reader = new BrowserQRCodeReader()
            const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
              if (!result || scanLockedRef.current) return
              handleScanned(result.getText())
              window.setTimeout(() => stopCamera(), 0)
            })
            scannerControlsRef.current = controls
            if (scanLockedRef.current || !video.isConnected) stopCamera()
          } catch {
            setScannerOpen(false)
            setScanMsg('Could not start the camera scanner. Check camera permission, or use your UPI app scanner.')
          }
        })()
      }, 100)
      return
    }

    setScannerOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      window.setTimeout(() => {
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        void video.play().catch(() => undefined)
        const detector = new DetectorCtor({ formats: ['qr_code'] })
        const tick = async () => {
          if (!streamRef.current || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const raw = codes?.[0]?.rawValue
            if (raw) {
              handleScanned(raw)
              stopCamera()
              return
            }
          } catch {
            // Try the next frame.
          }
          scanTimerRef.current = window.setTimeout(tick, 350)
        }
        void tick()
      }, 140)
    } catch {
      setScannerOpen(false)
      setScanMsg('Camera permission was not granted. Enter the seller UPI ID below or allow camera access to scan the QR.')
    }
  }

  function validate(requirePaidConfirmation = true, confirmedNow = false): string | null {
    if (!room || !realMembers.length) return 'Create a room and add members first.'
    if (!item.trim()) return 'Enter what you bought.'
    if (!amountPaise || amountPaise <= 0) return 'Enter a valid amount, such as 250 or 250.50.'
    if (!payer) return 'Select who paid.'
    if (!sharers.length) return 'Select at least one member for the split.'
    if (requirePaidConfirmation && !alreadyPaid && !confirmedNow) {
      return method === 'cash'
        ? 'Confirm that cash has been paid before saving.'
        : 'Confirm that the UPI payment was successful before saving.'
    }
    return null
  }

  function buildPurchaseDraft(amountToUse = amountPaise, payeeOverride?: ParsedUpiQr, forcePayNow = false): InstantPurchaseDraft | null {
    if (!payer) return null
    const [y, mo, da] = expenseDate.split('-').map(Number)
    const now = new Date()
    const createdAt = y && mo && da
      ? new Date(y, mo - 1, da, now.getHours(), now.getMinutes(), now.getSeconds()).getTime()
      : Date.now()
    const alreadyPaidAtBuild = !forcePayNow && alreadyPaid
    const methodAtBuild: Method = forcePayNow ? 'upi' : method
    const nameAtBuild = payeeOverride?.payeeName ?? payeeName.trim()
    const vpaAtBuild = payeeOverride?.payeeVpa ?? (vpaValid ? payeeVpa.trim().toLowerCase() : '')
    const paymentLabel = alreadyPaidAtBuild
      ? `Already paid by ${method.toUpperCase()}`
      : methodAtBuild === 'upi' ? 'Instant UPI payment' : methodAtBuild === 'cash' ? 'Cash payment' : 'Card payment'
    const noteParts = [
      paymentLabel,
      nameAtBuild,
      vpaAtBuild,
      !alreadyPaidAtBuild && payOpened ? 'Payment app opened' : '',
    ].filter(Boolean)
    return {
      description: item.trim(),
      amountPaise: amountToUse,
      category,
      payerId: payer.id,
      method: methodAtBuild,
      splitMode: splitChoice === 'equal' ? 'equal' : 'subset',
      splits: splitEqual(amountToUse, Math.max(1, sharers.length)).map((paise, index) => ({ memberId: sharers[index]?.id ?? payer.id, paise })),
      note: noteParts.join(' · '),
      vendorName: nameAtBuild || undefined,
      vendorUpiId: vpaAtBuild || undefined,
      instantPay: !alreadyPaidAtBuild,
      source: 'quickbuy',
      createdAt,
    }
  }

  function resetPurchaseForm() {
    clearItemDraft()
    clearAmountDraft()
    clearPayeeNameDraft()
    clearPayeeVpaDraft()
    clearDateDraft()
    setExpenseDate(toDateInput(new Date()))
    setItem('Sabji')
    setAmount('')
    setPayeeName('')
    setPayeeVpa('')
    
    setPayOpened(false)
    setReturnPrompt(false)
    setPendingIntent(null)
    setScanMsg('')
  }

  function savePurchase(confirmedNow = false) {
    const err = validate(true, confirmedNow)
    if (err) { setError(err); return }
    const draft = buildPurchaseDraft()
    if (!draft) return
    setError('')
    clearPendingInstantPurchase()
    addExpense(draft)
    pushToast({ message: `${draft.description} · ${formatINR(draft.amountPaise)} added to room history.`, tone: 'ok' })
    resetPurchaseForm()
    navigate('/room', { replace: true })
  }

  function completePendingPurchase(intent: InstantPurchaseIntent) {
    if (finishingIntentRef.current === intent.id) return
    finishingIntentRef.current = intent.id
    // Remove the one-time intent before writing so a duplicate focus/pageshow
    // event cannot create the same expense twice.
    clearPendingInstantPurchase(intent.id)
    const expense = addExpense(intent.expense)
    pushToast({
      message: `${intent.expense.description} · ${formatINR(intent.expense.amountPaise)} added after Instant Pay.`,
      tone: 'ok',
      actionLabel: 'Undo',
      onAction: () => deleteExpense(expense.id),
    })
    resetPurchaseForm()
    navigate('/room', { replace: true })
  }

  function cancelPendingPurchase() {
    if (pendingIntent) clearPendingInstantPurchase(pendingIntent.id)
    setPendingIntent(null)
    setReturnPrompt(false)
    
    setPayOpened(false)
    pushToast({ message: 'Pending Instant Pay was not added. Your purchase details are still in the form.', tone: 'warn' })
  }

  function launchInstantPay(link: string, scannedDraft?: InstantPurchaseDraft) {
    const err = scannedDraft
      ? (!room ? 'Create a room first.' : !scannedDraft.description.trim() ? 'Enter what you bought.' : !scannedDraft.amountPaise ? 'Enter a valid amount.' : !scannedDraft.splits.length ? 'Select at least one person for the expense.' : null)
      : validate(false)
    if (err) { setError(err); return }
    const draft = scannedDraft ?? buildPurchaseDraft()
    if (!draft || !room) return
    setError('')
    
    setReturnPrompt(false)
    const intent: InstantPurchaseIntent = {
      version: 1,
      id: globalThis.crypto?.randomUUID?.() ?? `instant-${Date.now()}`,
      roomId: room.id,
      startedAt: Date.now(),
      autoAddOnReturn,
      expense: {
        ...draft,
        note: [draft.note, 'Payment app opened'].filter(Boolean).join(' · '),
      },
    }
    const saved = savePendingInstantPurchase(intent)
    if (saved) {
      setPendingIntent(intent)
    } else {
      pushToast({ message: 'The payment app will open, but return completion could not be saved in this browser.', tone: 'warn' })
    }
    setPayOpened(true)
    const genericLink = buildUpiLink({ payeeVpa: draft.vendorUpiId, payeeName: draft.vendorName || 'Shop', amountPaise: draft.amountPaise, note: `RoomHisaab: ${draft.description}`, app: 'any' })
    if (genericLink && genericLink !== link) {
      let appOpened = false
      const onVisibilityChange = () => { if (document.visibilityState === 'hidden') appOpened = true }
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.setTimeout(() => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        if (!appOpened && document.visibilityState === 'visible') window.location.href = genericLink
      }, 1400)
    }
    window.location.href = link
  }

  useEffect(() => {
    if (!scannerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') stopScanner() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [scannerOpen])

  useEffect(() => {
    if (pendingIntent && room && pendingIntent.roomId !== room.id) {
      setPendingIntent(null)
      setReturnPrompt(false)
      return
    }

    const checkReturn = () => {
      const intent = loadPendingInstantPurchase()
      if (!intent) {
        setPendingIntent(null)
        setReturnPrompt(false)
        return
      }
      if (room && intent.roomId !== room.id) return
      setPendingIntent(intent)
      if (!isInstantPayReturnReady(intent)) {
        window.clearTimeout(returnTimerRef.current)
        returnTimerRef.current = window.setTimeout(checkReturn, 3600)
        return
      }
      if (intent.autoAddOnReturn) completePendingPurchase(intent)
      else setReturnPrompt(true)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') checkReturn() }

    checkReturn()
    window.addEventListener('focus', checkReturn)
    window.addEventListener('pageshow', checkReturn)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', checkReturn)
      window.removeEventListener('pageshow', checkReturn)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // Purchase completion intentionally reads the latest store callbacks from
    // this render; the storage snapshot itself does not change while paying.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIntent?.id, room?.id])

  if (!room || realMembers.length === 0) {
    return (
      <>
        <PageHead title="Quick Buy" sub="First create or join a room." />
        <EmptyState
          emoji="🛒"
          title="Create your room first"
          body="After the room is ready, use this page to pay for a new purchase or write down a purchase you already paid for."
          action={<><Link to="/onboarding" className="btn-primary">Create room</Link><button className="btn-outline" onClick={() => { void loadDemo() }}>View demo</button></>}
        />
      </>
    )
  }

  const splitSummary = splitChoice === 'personal' || isSolo
    ? 'Only me'
    : splitChoice === 'selected'
      ? `${sharers.length} selected member${sharers.length === 1 ? '' : 's'}`
      : `Equally between ${realMembers.length} members`

  return (
    <>
      <PageHead
        title="Quick Buy"
        sub="Use this when you bought something: pay now, or choose Already paid."
        right={<Link to="/room/history" className="btn-outline"><Icon name="receipt" size={18} /> History</Link>}
      />

      <div className="mx-auto max-w-3xl space-y-4">
        {pendingIntent && pendingIntent.roomId === room.id && (
          <section className="overflow-hidden rounded-[22px] border border-primary/30 bg-primary/10 p-4 shadow-card sm:p-5" aria-labelledby="instant-pay-finish-title">
            <div className="flex flex-wrap items-start gap-3">
              <span className="icon-tile h-12 w-12"><Icon name="wallet" size={23} /></span>
              <div className="min-w-[220px] flex-1">
                <p className="kicker">{returnPrompt ? 'Welcome back' : 'Instant Pay in progress'}</p>
                <h2 id="instant-pay-finish-title" className="mt-1 text-[19px]">Finish {pendingIntent.expense.description} · {formatINR(pendingIntent.expense.amountPaise)}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                  {returnPrompt
                    ? 'If the UPI app showed success, add this purchase now. RoomHisaab cannot verify the bank result automatically.'
                    : 'Complete the payment in your UPI app, then return here. This pending purchase stays available for 30 minutes.'}
                </p>
              </div>
            </div>
            <button type="button" className="btn-ghost mt-3 !min-h-[38px] !px-2 !text-[12px]" onClick={cancelPendingPurchase}>
              I did not pay — cancel this pending payment
            </button>
          </section>
        )}

        <SectionCard title="1) What did you buy?" sub="Start with only the item and amount. Everything else is optional.">
          <label className="label" htmlFor="qb-item">What did you buy? *</label>
          <input
            id="qb-item"
            className="input !text-[16px]"
            value={item}
            onChange={(e) => { setItem(e.target.value); setError('') }}
            placeholder="Milk, electricity bill, petrol…"
            autoComplete="off"
          />

          <label className="label mt-4" htmlFor="qb-amount">Amount *</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-ink-soft font-display font-bold" aria-hidden="true">₹</span>
            <input
              id="qb-amount"
              type="text"
              className="input !pl-11 !text-[28px] !font-display !font-bold !py-2.5 num"
              inputMode="decimal"
              enterKeyHint="done"
              autoFocus={!pendingIntent}
              placeholder="0"
              value={amount}
              onChange={(e) => { setAmount(sanitizeAmountInput(e.target.value)); setError('');  }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            />
          </div>
          {amountPaise > 0 && <p className="text-[12px] text-ink-soft mt-1.5">{formatINR(amountPaise)} · {splitSummary}</p>}

          <button
            type="button"
            className="btn-ghost !px-2 !py-1.5 !text-[13px] mt-3"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
          >
            <Icon name="settings" size={16} /> {moreOpen ? 'Hide optional choices' : 'Optional: date, category, and who shares'}
          </button>

          {moreOpen && (
            <div className="mt-3 rounded-2xl border border-line-light bg-surface-card2 p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="qb-date">Purchase date</label>
                  <input id="qb-date" type="date" className="input" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="qb-category">Category</label>
                  <select id="qb-category" className="input" value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {!isCloudRoomActive && (
                <div>
                  <label className="label" htmlFor="qb-payer">Paid by</label>
                  <select id="qb-payer" className="input" value={payer?.id ?? ''} onChange={(e) => setPayerId(e.target.value)}>
                    {realMembers.map((m) => <option key={m.id} value={m.id}>{m.name}{me?.id === m.id ? ' (You)' : ''}</option>)}
                  </select>
                </div>
              )}

              {!isSolo ? (
                <div>
                  <span className="label">Who shares this cost?</span>
                  <div className="grid grid-cols-3 gap-2">
                    {([['equal', 'Everyone'], ['personal', 'Only me'], ['selected', 'Selected']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSplitChoice(key)}
                        className={clsx('rounded-xl border px-2 py-2.5 text-[13px] font-bold', splitChoice === key ? 'border-primary bg-primary/10 text-primary' : 'border-line-light text-ink-soft')}
                        aria-pressed={splitChoice === key}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {splitChoice === 'selected' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {realMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelected((p) => ({ ...p, [m.id]: !p[m.id] }))}
                          className={selected[m.id] ? 'chip-on' : 'chip-off'}
                          aria-pressed={!!selected[m.id]}
                        >
                          <Avatar name={m.name} color={m.color} size={18} />{m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-soft">This purchase is for your personal expense space. You can share costs with added members later.</p>
              )}

              {amountPaise > 0 && sharers.length > 0 && (
                <div className="rounded-xl bg-white/70 border border-line-light p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-1.5">Each person’s share</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                    {splits.map((s) => {
                      const m = members.find((x) => x.id === s.memberId)
                      return <span key={s.memberId}><b>{m?.name}</b> · <span className="num text-primary">{formatINR(s.paise)}</span></span>
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard title="2) Pay or save it" sub={alreadyPaid ? 'No payment app will open. Save only writes this purchase in History and balances.' : 'Pay in your UPI app or with cash, then confirm and save here.'}>
          <span className="label">Have you already paid?</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Payment status">
            <button
              type="button"
              onClick={() => { setPaymentTiming('now'); setError('') }}
              className={clsx('rounded-xl border px-3 py-3 text-[14px] font-bold', !alreadyPaid ? 'border-primary bg-primary/10 text-primary' : 'border-line-light text-ink-soft')}
              aria-pressed={!alreadyPaid}
            >
              Pay now
            </button>
            <button
              type="button"
              onClick={() => { setPaymentTiming('already'); setPayOpened(false); stopScanner(); setError('') }}
              className={clsx('rounded-xl border px-3 py-3 text-[14px] font-bold', alreadyPaid ? 'border-primary bg-primary/10 text-primary' : 'border-line-light text-ink-soft')}
              aria-pressed={alreadyPaid}
            >
              Yes — Already paid
            </button>
          </div>

          <span className="label mt-4">How will it be paid, or how was it paid?</span>
          <div className={clsx('grid gap-2', alreadyPaid ? 'grid-cols-3' : 'grid-cols-2')} role="group" aria-label="Payment method">
            {(['upi', 'cash', ...(alreadyPaid ? ['card'] : [])] as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMethod(m); setError('') }}
                className={clsx('rounded-xl border px-3 py-3 text-[14px] font-bold uppercase', method === m ? 'border-primary bg-primary/10 text-primary' : 'border-line-light text-ink-soft')}
                aria-pressed={method === m}
              >
                {m}
              </button>
            ))}
          </div>

          {!alreadyPaid && method === 'upi' && (
            <div className="mt-4">
              <label className="label" htmlFor="qb-upi-app">Payment app</label>
              <select id="qb-upi-app" className="input" value={upiApp} onChange={(e) => setUpiApp(e.target.value as UpiApp)}>
                {UPI_APPS.map((app) => <option key={app.id} value={app.id}>{app.label}</option>)}
              </select>
            </div>
          )}

          {alreadyPaid ? (
            <p className="mt-4 rounded-xl border border-moneyin/25 bg-moneyin/10 px-3.5 py-3 text-[13px] text-ink-soft">
              No payment app will open. Save to add this {method.toUpperCase()} purchase to the room balance and history.
            </p>
          ) : method === 'cash' ? (
            <p className="mt-4 rounded-xl border border-moneyin/25 bg-moneyin/10 px-3.5 py-3 text-[13px] text-ink-soft">
              Pay <b className="text-ink">{amountPaise ? formatINR(amountPaise) : 'the amount'}</b> in cash, then confirm below.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-2.5">
                {directLink ? (
                  <button type="button" onClick={() => launchInstantPay(directLink)} className="btn-primary w-full !py-3 sm:col-span-2">
                    <Icon name="wallet" /> Pay{amountPaise ? ` ${formatINR(amountPaise)}` : ''} with {UPI_APPS.find((app) => app.id === upiApp)?.label ?? 'UPI app'}
                  </button>
                ) : (
                  <button type="button" onClick={() => scannerOpen ? stopScanner() : startScanner()} className="btn-primary w-full !py-3 sm:col-span-2">
                    <Icon name="scan" /> {scannerOpen ? 'Close seller QR scanner' : 'Scan seller QR'}
                  </button>
                )}
              </div>

              {scanMsg && <p className="text-[12.5px] font-semibold text-primary" role="status">{scanMsg}</p>}

              <details className="rounded-xl border border-line-light bg-surface-card2 px-3.5 py-3">
                <summary className="cursor-pointer text-[13px] font-bold">Optional: seller UPI ID, name, and preferred app</summary>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="label" htmlFor="qb-payee-name">Seller name</label>
                    <input id="qb-payee-name" className="input" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="Sharma General Store" />
                  </div>
                  <div>
                    <label className="label" htmlFor="qb-payee-vpa">Seller UPI ID</label>
                    <input id="qb-payee-vpa" className="input" value={payeeVpa} onChange={(e) => setPayeeVpa(e.target.value.trim().toLowerCase())} placeholder="shop@okaxis" autoCapitalize="none" />
                    {payeeVpa && <p className={clsx('text-[11.5px] font-semibold mt-1', vpaValid ? 'text-moneyin' : 'text-overdue')}>{vpaValid ? 'Valid UPI ID format.' : 'Invalid UPI ID format.'}</p>}
                  </div>
                </div>
                {qrPayload && (
                  <div className="text-center mt-4">
                    <div className="qr-shell inline-grid place-items-center rounded-[20px] p-3">
                      <QRCodeCanvas value={qrPayload} size={154} level="M" includeMargin bgColor="#FFFFFF" fgColor="#18172B" />
                    </div>
                    <p className="text-[12px] text-ink-soft mt-2">Use another phone to scan this seller QR, or open the payment app above.</p>
                  </div>
                )}
              </details>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-light bg-surface-card2 p-3.5">
                <input
                  type="checkbox"
                  checked={autoAddOnReturn}
                  onChange={(e) => setAutoAddOnReturn(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded accent-primary"
                />
                <span className="text-[13px] leading-relaxed text-ink-soft">
                  <b className="text-ink">Add automatically when I return</b> (optional). Use this only when returning means the payment succeeded. Undo is available if it was added by mistake.
                </span>
              </label>
              <p className="text-[12px] leading-relaxed text-ink-soft">
                RoomHisaab will detect your return and finish the entry. Verify the seller name and amount inside your UPI app. Never enter a UPI PIN on this website.
              </p>
            </div>
          )}



          {error && <p className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[13px] font-semibold text-overdue" role="alert">{error}</p>}

          <button type="button" onClick={() => {
            if (pendingIntent && pendingIntent.roomId === room.id) completePendingPurchase(pendingIntent)
            else savePurchase(!alreadyPaid)
          }} className="btn-accent w-full !py-3.5 !text-[16px] mt-4">
            <Icon name="check" /> {pendingIntent?.roomId === room.id ? 'UPI payment successful — add expense' : alreadyPaid ? 'Add to room history' : method === 'upi' ? 'UPI payment successful — add expense' : 'Cash paid — add expense'}{amountPaise ? ` · ${formatINR(amountPaise)}` : ''}
          </button>
        </SectionCard>
      </div>

      {scannerOpen && (
        <div className="qr-scanner-fullscreen fixed inset-0 z-[120] flex flex-col bg-[#090B16] text-white" role="dialog" aria-modal="true" aria-labelledby="seller-scanner-title">
          <header className="relative z-10 flex items-center gap-3 px-4 pb-4 sm:px-6" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <button type="button" autoFocus onClick={stopScanner} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white" aria-label="Close QR scanner">
              <Icon name="x" size={21} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A8A0FF]">Quick Buy</p>
              <h2 id="seller-scanner-title" className="truncate text-[18px] text-white">{scanPhase === 'success' ? 'Seller found' : 'Scan seller QR'}</h2>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80">{UPI_APPS.find((app) => app.id === upiApp)?.label ?? 'UPI app'}</span>
          </header>

          <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5">
            {scanPhase === 'scanning' ? (
              <>
                <video ref={videoRef} autoPlay className="absolute inset-0 h-full w-full object-cover" muted playsInline aria-label="Camera view for scanning the seller QR" />
                <div className="qr-scanner-vignette absolute inset-0" aria-hidden="true" />
                <div className="qr-scanner-target relative z-10" aria-hidden="true">
                  <span className="qr-scanner-corner qr-scanner-tl" />
                  <span className="qr-scanner-corner qr-scanner-tr" />
                  <span className="qr-scanner-corner qr-scanner-bl" />
                  <span className="qr-scanner-corner qr-scanner-br" />
                  <span className="qr-scanner-beam" />
                </div>
              </>
            ) : (
              <div className="relative z-10 mx-auto w-full max-w-sm text-center">
                <div className="qr-scan-success mx-auto grid h-24 w-24 place-items-center rounded-full border border-[#8C82FF]/50 bg-[#5046C8]/25 text-[#B9B2FF] shadow-[0_0_55px_rgba(80,70,200,.35)]">
                  <Icon name="check" size={43} />
                </div>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.17em] text-[#A8A0FF]">Seller details scanned</p>
                <h3 className="mt-2 break-words text-[24px] text-white">{scannedSeller?.payeeName ?? 'UPI seller'}</h3>
                <p className="mt-1 break-all text-[14px] text-white/75">{scannedSeller?.payeeVpa}</p>
                {scannedSeller?.amountPaise && <p className="mt-3 font-display text-[23px] font-bold text-white">{formatINR(scannedSeller.amountPaise)}</p>}
                <p className="mt-5 text-[13px] leading-relaxed text-white/75" role="status" aria-live="polite">{scanMsg || 'Opening your selected payment app…'}</p>
                <div className="mt-5 flex justify-center gap-2" aria-hidden="true"><i className="qr-success-dot" /><i className="qr-success-dot" /><i className="qr-success-dot" /></div>
              </div>
            )}
          </main>

          <footer className="relative z-10 px-6 pb-6 pt-4 text-center" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            {scanPhase === 'scanning' ? (
              <>
                <p className="text-[15px] font-semibold text-white">Place the QR inside the frame</p>
                <p className="mt-1 text-[12.5px] text-white/65">Keep your phone steady. The payment app opens after the seller is read.</p>
              </>
            ) : (
              <p className="text-[12.5px] text-white/70">Opening {UPI_APPS.find((app) => app.id === upiApp)?.label ?? 'your UPI app'}…</p>
            )}
            {scanMsg && scanPhase === 'scanning' && <p className="mx-auto mt-3 max-w-sm text-[12px] leading-relaxed text-[#C5C3E1]" role="status" aria-live="polite">{scanMsg}</p>}
          </footer>
        </div>
      )}
    </>
  )
}
