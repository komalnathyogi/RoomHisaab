import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
type EntryMode = 'expense' | 'scan'

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

type CameraFailure = 'permission' | 'unavailable' | 'busy' | 'secure' | 'failed'

function cameraFailureKind(cause: unknown): CameraFailure {
  const name = cause instanceof DOMException ? cause.name : cause instanceof Error ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'permission'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'busy'
  if (name === 'SecurityError' && typeof window !== 'undefined' && !window.isSecureContext) return 'secure'
  return 'failed'
}

function cameraFailureMessage(kind: CameraFailure): string {
  if (kind === 'permission') return 'Camera access is blocked. Allow camera access in your browser settings, or enter the UPI ID manually.'
  if (kind === 'unavailable') return 'No camera was found on this device. Upload a QR image or enter the UPI ID manually.'
  if (kind === 'busy') return 'The camera is busy. Close other apps using it and try again.'
  if (kind === 'secure') return 'Camera access needs a secure HTTPS page. Open RoomHisaab securely or enter the UPI ID manually.'
  return 'The scanner could not start. Try again, upload a QR image, or enter the UPI ID manually.'
}

export default function QuickBuy() {
  const navigate = useNavigate()
  const location = useLocation()
  const [entryMode, setEntryMode] = useState<EntryMode>(() => new URLSearchParams(window.location.search).get('mode') === 'scan' ? 'scan' : 'expense')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('paid')
  const { addExpense, deleteExpense, pushToast, loadDemo, isCloudRoomActive } = useStore()
  const { room, members, me } = useRoomData()

  // Draft fields survive page changes, refresh and browser restart.
  const [item, setItem, clearItemDraft] = usePersistentState('quickbuy.item.v2', () => loadDraft<string>('quickbuy.item', '').trim())
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const [cameraFailure, setCameraFailure] = useState<CameraFailure | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [scanPhase, setScanPhase] = useState<'scanning' | 'success'>('scanning')
  const [cameraTrack, setCameraTrack] = useState<MediaStreamTrack | null>(null)
  const [cameraCaps, setCameraCaps] = useState<{ zoom?: { min: number; max: number; step?: number }; torch?: boolean } | null>(null)
  const [cameraZoom, setCameraZoom] = useState(1)
  const [torchOn, setTorchOn] = useState(false)
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [cameraIndex, setCameraIndex] = useState(0)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const payeeDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const [scannedSeller, setScannedSeller] = useState<ParsedUpiQr | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null)
  const scanTimerRef = useRef<number | undefined>(undefined)
  const finishingIntentRef = useRef('')
  const purchaseLockRef = useRef(false)
  const returnTimerRef = useRef<number | undefined>(undefined)
  const scanAutoLaunchRef = useRef<number | undefined>(undefined)
  const scanCloseTimerRef = useRef<number | undefined>(undefined)
  const scanLockedRef = useRef(false)
  const scannerStartLockRef = useRef(false)

  const realMembers = useMemo(() => members.filter((m) => !m.isVirtual), [members])
  const realIds = realMembers.map((m) => m.id).join(',')
  const isPersonal = realMembers.length <= 1
  const isSolo = isPersonal
  const amountPaise = parseRupeesToPaise(amount) ?? 0
  const payer = isPersonal || isCloudRoomActive
    ? (me ?? realMembers[0])
    : (members.find((m) => m.id === payerId) ?? me ?? realMembers[0])
  const alreadyPaid = entryMode === 'expense' && paymentStatus === 'paid'

  useEffect(() => {
    setEntryMode(new URLSearchParams(location.search).get('mode') === 'scan' ? 'scan' : 'expense')
  }, [location.search])

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
    stopCamera()
  }, [])

  const sharers = useMemo(() => {
    if (isPersonal || realMembers.length === 1) return payer ? [payer] : []
    if (splitChoice === 'personal') return payer ? [payer] : []
    if (splitChoice === 'selected') return realMembers.filter((m) => selected[m.id])
    return realMembers
  }, [isPersonal, splitChoice, payer, realMembers, selected])

  const splits = useMemo(() => {
    if (!amountPaise || !sharers.length) return []
    return splitEqual(amountPaise, sharers.length).map((paise, i) => ({ memberId: sharers[i].id, paise }))
  }, [amountPaise, sharers])

  const vpaValid = isValidVpa(payeeVpa)
  const upiPayload = useMemo(() => ({
    payeeVpa,
    payeeName: payeeName.trim() || 'Shop',
    amountPaise,
    note: item.trim() ? `RoomHisaab: ${item.trim()}` : 'RoomHisaab Add Expense',
  }), [payeeVpa, payeeName, amountPaise, item])
  const directLink = entryMode === 'scan' && amountPaise > 0 ? buildUpiLaunchLink({ ...upiPayload, app: upiApp }) : null
  const qrPayload = entryMode === 'scan' && amountPaise > 0 ? upiQrPayload(upiPayload) : null

  function syncCameraTrack(stream: MediaStream | null) {
    const track = stream?.getVideoTracks()[0] ?? null
    setCameraTrack(track)
    if (!track) { setCameraCaps(null); return }
    try {
      const candidate = track as MediaStreamTrack & { getCapabilities?: () => MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number }; torch?: boolean } }
      const caps = candidate.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number }; torch?: boolean }) | undefined
      setCameraCaps(caps ? { zoom: caps.zoom, torch: caps.torch } : null)
      setCameraZoom(caps?.zoom?.min ?? 1)
      setTorchOn(false)
    } catch { setCameraCaps(null) }
    void navigator.mediaDevices?.enumerateDevices().then((devices) => setVideoInputs(devices.filter((device) => device.kind === 'videoinput'))).catch(() => undefined)
  }

  function stopCamera() {
    window.clearTimeout(scanTimerRef.current)
    try { streamRef.current?.getTracks().forEach((track) => { try { track.stop() } catch { /* track may already be closed */ } }) } catch { /* ignore camera cleanup failures */ }
    streamRef.current = null
    syncCameraTrack(null)
    try { scannerControlsRef.current?.stop() } catch { /* scanner may already be stopped */ }
    scannerControlsRef.current = null
    scannerStartLockRef.current = false
    setCameraReady(false)
  }

  async function setZoomLevel(next: number) {
    const range = cameraCaps?.zoom
    if (!cameraTrack || !range) return
    const value = Math.max(range.min, Math.min(range.max, next))
    try {
      await cameraTrack.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] })
      setCameraZoom(value)
    } catch { setScanMsg('Camera zoom could not be changed. Try a lower zoom level.') }
  }

  async function toggleTorch() {
    if (!cameraTrack || !cameraCaps?.torch) return
    const next = !torchOn
    try {
      await cameraTrack.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch { setScanMsg('The flashlight could not be changed on this camera.') }
  }

  function switchCamera() {
    if (videoInputs.length < 2) return
    const nextIndex = (cameraIndex + 1) % videoInputs.length
    setCameraIndex(nextIndex)
    const deviceId = videoInputs[nextIndex]?.deviceId
    window.setTimeout(() => { stopCamera(); void startScanner(deviceId) }, 50)
  }

  async function decodeGalleryImage(file: File) {
    setError('')
    setScanMsg('Reading QR image…')
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const url = URL.createObjectURL(file)
      try {
        const result = await new BrowserQRCodeReader().decodeFromImageUrl(url)
        handleScanned(result.getText())
        setScannerOpen(false)
      } finally { URL.revokeObjectURL(url) }
    } catch {
      setScanMsg('No readable QR code was found in that image. Try a clearer image or enter the UPI ID manually.')
    }
  }

  function stopScanner() {
    window.clearTimeout(scanAutoLaunchRef.current)
    window.clearTimeout(scanCloseTimerRef.current)
    stopCamera()
    setScannerOpen(false)
    setCameraReady(false)
    setCameraFailure(null)
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

    const note = item.trim() ? `RoomHisaab: ${item.trim()}` : 'RoomHisaab Add Expense'
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
    setScanMsg(`Seller found: ${parsed.payeeName}. Check the seller and amount, then choose your payment app.`)
    scanCloseTimerRef.current = window.setTimeout(() => setScannerOpen(false), 1500)
  }

  async function startScanner(deviceId?: string) {
    const formError = validate(false)
    if (formError) { setError(formError); return }
    setScanMsg('')
    setCameraFailure(null)
    setCameraReady(false)
    setScannedSeller(null)
    setScanPhase('scanning')
    scanLockedRef.current = false
    setError('')
    setScannerOpen(true)
    if (scannerStartLockRef.current) return
    scannerStartLockRef.current = true

    const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> } }).BarcodeDetector
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.getUserMedia) {
      scannerStartLockRef.current = false
      setCameraFailure('unavailable')
      setScanMsg(cameraFailureMessage('unavailable'))
      return
    }

    if (!DetectorCtor) {
      // ZXing is loaded only when this browser has no native QR detector.
      window.setTimeout(() => {
        void (async () => {
          try {
            const video = videoRef.current
            if (!video) throw new Error('Scanner video is not ready')
            const { BrowserQRCodeReader } = await import('@zxing/browser')
            const reader = new BrowserQRCodeReader()
            const controls = await reader.decodeFromVideoDevice(deviceId, video, (result) => {
              if (!result || scanLockedRef.current) return
              handleScanned(result.getText())
              window.setTimeout(() => stopCamera(), 0)
            })
            scannerControlsRef.current = controls
            const zxingStream = video.srcObject instanceof MediaStream ? video.srcObject : null
            if (zxingStream) { streamRef.current = zxingStream; syncCameraTrack(zxingStream); setCameraReady(true) }
            if (scanLockedRef.current || !video.isConnected) stopCamera()
          } catch (cause) {
            stopCamera()
            const failure = cameraFailureKind(cause)
            setCameraFailure(failure)
            setScanMsg(cameraFailureMessage(failure))
          }
        })()
      }, 100)
      return
    }

    try {
      const stream = await mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      syncCameraTrack(stream)
      window.setTimeout(() => {
        const video = videoRef.current
        if (!video || !video.isConnected || !streamRef.current) { stopCamera(); return }
        try {
          video.srcObject = stream
          void video.play().then(() => setCameraReady(true)).catch(() => {
            setCameraFailure('failed')
            setScanMsg(cameraFailureMessage('failed'))
          })
          const detector = new DetectorCtor({ formats: ['qr_code'] })
          const tick = async () => {
            if (!streamRef.current || !videoRef.current || !videoRef.current.isConnected) return
            try {
              const codes = await detector.detect(videoRef.current)
              const raw = codes?.[0]?.rawValue
              if (raw) { handleScanned(raw); stopCamera(); return }
            } catch {
              // An unreadable frame is normal. Keep waiting for the next frame.
            }
            if (streamRef.current) scanTimerRef.current = window.setTimeout(tick, 350)
          }
          void tick()
        } catch (cause) {
          stopCamera()
          setCameraFailure('failed')
          setScanMsg(cameraFailureMessage('failed'))
          console.warn('RoomHisaab camera scanner initialization failed:', cause instanceof Error ? cause.name : 'unknown error')
        }
      }, 140)
    } catch (cause) {
      stopCamera()
      const failure = cameraFailureKind(cause)
      setCameraFailure(failure)
      setScanMsg(cameraFailureMessage(failure))
      setScannerOpen(true)
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
    setItem('')
    setAmount('')
    setPaymentStatus('paid')
    setPayeeName('')
    setPayeeVpa('')
    
    setPayOpened(false)
    setReturnPrompt(false)
    setPendingIntent(null)
    setScanMsg('')
  }

  function savePurchase(confirmedNow = false) {
    if (purchaseLockRef.current) return
    const err = entryMode === 'expense' ? validate(false) : validate(true, confirmedNow)
    if (err) { setError(err); return }
    const draft = buildPurchaseDraft()
    if (!draft) return
    purchaseLockRef.current = true
    setSaving(true)
    setError('')
    clearPendingInstantPurchase()
    const saved = addExpense({ ...draft, status: entryMode === 'expense' && paymentStatus === 'unpaid' ? 'pending' : 'confirmed', instantPay: entryMode === 'scan' && !alreadyPaid && !room?.demo })
    pushToast({ message: room?.demo ? 'Demo payment recorded. No money was sent.' : entryMode === 'expense' && paymentStatus === 'unpaid' ? 'Expense saved as unpaid.' : 'Expense added successfully.', tone: 'ok', actionLabel: 'Undo', onAction: () => deleteExpense(saved.id) })
    window.setTimeout(() => { resetPurchaseForm(); navigate('/room', { replace: true }) }, 240)
  }

  function completePendingPurchase(intent: InstantPurchaseIntent) {
    if (finishingIntentRef.current === intent.id) return
    finishingIntentRef.current = intent.id
    setSaving(true)
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
    window.setTimeout(() => { resetPurchaseForm(); navigate('/room', { replace: true }) }, 240)
  }

  function savePendingAsUnpaid(intent: InstantPurchaseIntent) {
    if (finishingIntentRef.current === intent.id) return
    finishingIntentRef.current = intent.id
    setSaving(true)
    clearPendingInstantPurchase(intent.id)
    const expense = addExpense({ ...intent.expense, status: 'pending', instantPay: false })
    setPendingIntent(null)
    setReturnPrompt(false)
    pushToast({ message: 'Purchase saved as unpaid. No payment was confirmed.', tone: 'warn', actionLabel: 'Undo', onAction: () => deleteExpense(expense.id) })
    window.setTimeout(() => { resetPurchaseForm(); navigate('/room', { replace: true }) }, 240)
  }

  function retryPendingPayment(intent: InstantPurchaseIntent) {
    const expense = intent.expense
    const link = buildUpiLaunchLink({ payeeVpa: expense.vendorUpiId, payeeName: expense.vendorName || 'Shop', amountPaise: expense.amountPaise, note: `RoomHisaab: ${expense.description}`, app: upiApp })
    if (!link) { setError('A valid seller UPI ID is required to try this payment again.'); return }
    launchInstantPay(link, expense)
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
      autoAddOnReturn: false,
      paymentApp: upiApp,
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
    if (room.demo) {
      setPayOpened(false)
      setScanMsg('Demo Mode: no payment app will open and no money will be sent. Use Simulate Payment to record this sample expense.')
      return
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
        <PageHead title="Add Expense" sub="First create or join a room." />
        <EmptyState
          emoji="🛒"
          title="Create your room first"
          body="After the room is ready, use this page to pay for a new purchase or write down a purchase you already paid for."
          action={<><Link to="/onboarding" className="btn-primary">Create room</Link><button className="btn-outline" onClick={() => loadDemo()}>View demo</button></>}
        />
      </>
    )
  }

  const splitSummary = splitChoice === 'personal' || isSolo
    ? 'Only Me'
    : splitChoice === 'selected'
      ? `${sharers.length} selected member${sharers.length === 1 ? '' : 's'}`
      : `Shared equally with ${realMembers.length} members`

  return (
    <>
      <PageHead
        title={entryMode === 'scan' ? 'Quick Pay' : 'Add Expense'}
        sub={entryMode === 'scan' ? 'Scan a seller QR, check the details, and choose whether to save the expense.' : 'Record an expense that is already paid or still unpaid.'}
        right={<Link to="/room/history" className="btn-outline"><Icon name="receipt" size={18} /> Expenses</Link>}
      />

      <div className="mx-auto max-w-3xl mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-line-light bg-surface-alt p-1.5" role="tablist" aria-label="Choose what you want to do">
        <button type="button" role="tab" aria-selected={entryMode === 'expense'} onClick={() => { setEntryMode('expense'); setError('') }} className={clsx('min-h-[44px] rounded-xl px-3 text-[13.5px] font-bold',entryMode==='expense'?'bg-surface-card text-primary shadow-card':'text-ink-soft')}>Add Expense</button>
        <button type="button" role="tab" aria-selected={entryMode === 'scan'} onClick={() => { setEntryMode('scan'); setPaymentStatus('unpaid'); setMethod('upi'); setPaymentTiming('now'); setError('') }} className={clsx('min-h-[44px] rounded-xl px-3 text-[13.5px] font-bold',entryMode==='scan'?'bg-surface-card text-primary shadow-card':'text-ink-soft')}>Quick Pay</button>
      </div>
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
                <p className="mt-2 text-[12px] text-ink-soft">Seller: <b className="text-ink">{pendingIntent.expense.vendorName || 'Seller'}</b>{pendingIntent.expense.vendorUpiId ? ` · ${pendingIntent.expense.vendorUpiId}` : ''} · {UPI_APPS.find((app) => app.id === pendingIntent.paymentApp)?.label ?? 'UPI app'} · {formatINR(pendingIntent.expense.amountPaise)}</p>
              </div>
            </div>
            {returnPrompt && <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button type="button" className="btn-accent" onClick={() => completePendingPurchase(pendingIntent)}><Icon name="check" size={17} /> Yes, Save as Paid</button>
              <button type="button" className="btn-outline" onClick={() => retryPendingPayment(pendingIntent)}><Icon name="wallet" size={17} /> Try Again</button>
              <button type="button" className="btn-outline" onClick={() => savePendingAsUnpaid(pendingIntent)}><Icon name="receipt" size={17} /> Save as Unpaid</button>
            </div>}
            <button type="button" className="btn-ghost mt-3 !min-h-[38px] !px-2 !text-[12px]" onClick={cancelPendingPurchase}>
              Cancel — I did not pay
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
          <div className="flex flex-wrap gap-2 mt-2.5" aria-label="Common expense ideas">
            {([['Groceries','groceries'],['Food','food'],['Rent','rent'],['Electricity','electricity'],['WiFi','wifi']] as const).map(([name, cat]) => <button key={name} type="button" className="chip-off !text-[12px] !py-1.5" onClick={() => { setItem(name); setCategory(cat) }}>{name}</button>)}
          </div>

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

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="qb-payer-main">Who paid?</label>
              {!isCloudRoomActive && !isPersonal ? <select id="qb-payer-main" className="input" value={payer?.id ?? ''} onChange={(e) => setPayerId(e.target.value)}>
                {realMembers.map((m) => <option key={m.id} value={m.id}>{me?.id === m.id ? 'You' : m.name}</option>)}
              </select> : <output id="qb-payer-main" className="input flex items-center">{payer?.id === me?.id || !payer ? 'You' : payer.name}</output>}
            </div>
            <div>
              <label className="label" htmlFor="qb-split">Who shares this expense?</label>
              {!isPersonal && realMembers.length > 1 ? <select id="qb-split" className="input" value={splitChoice} onChange={(e) => setSplitChoice(e.target.value as SplitChoice)}>
                <option value="equal">Everyone</option><option value="selected">Choose Members</option><option value="personal">Only Me</option>
              </select> : <output id="qb-split" className="input flex items-center">Only me</output>}
            </div>
          </div>
          {splitChoice === 'selected' && !isSolo && <div className="flex flex-wrap gap-2 mt-3" aria-label="Choose members">
            {realMembers.map((m) => <button key={m.id} type="button" onClick={() => setSelected((p) => ({ ...p, [m.id]: !p[m.id] }))} className={selected[m.id] ? 'chip-on' : 'chip-off'} aria-pressed={!!selected[m.id]}><Avatar name={m.name} color={m.color} size={18} />{m.name}</button>)}
          </div>}
          {amountPaise > 0 && <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5" aria-live="polite">
            <p className="text-[12px] font-bold text-ink-soft mb-2">Each person’s share</p>
            {splits.map((part) => { const member = realMembers.find((m) => m.id === part.memberId); return <div key={part.memberId} className="flex justify-between gap-3 py-1 text-[13.5px]"><span>{member?.id === me?.id ? 'You' : member?.name}</span><b className="num">{formatINR(part.paise)}</b></div> })}
            {splits.length === 0 && <p className="text-[12.5px] text-overdue">Choose at least one member to share this expense.</p>}
          </div>}
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

        <SectionCard title={entryMode === 'scan' ? 'Quick Pay' : 'Payment details'} sub={entryMode === 'scan' ? 'Scan the seller QR, review the amount, then open your UPI app.' : 'Choose the payment status and method. Unpaid expenses do not change balances.'}>
          {entryMode === 'expense' ? <>
            <span className="label">Payment status</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Payment status">
              {([['paid','Paid'],['unpaid','Not Paid']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => { setPaymentStatus(value); setError('') }} aria-pressed={paymentStatus===value} className={clsx('min-h-[44px] rounded-xl border px-3 py-3 text-[14px] font-bold',paymentStatus===value?'border-primary bg-primary/10 text-primary':'border-line-light text-ink-soft')}>{label}</button>)}
            </div>
            <span className="label mt-4">Payment method</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment method">
              {(['upi','cash','card'] as Method[]).map((m) => <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method===m} className={clsx('min-h-[44px] rounded-xl border px-3 py-3 text-[14px] font-bold uppercase',method===m?'border-primary bg-primary/10 text-primary':'border-line-light text-ink-soft')}>{m}</button>)}
            </div>
            {paymentStatus === 'unpaid' && <p className="mt-3 rounded-xl border border-pending/30 bg-pending/10 px-3.5 py-3 text-[13px] text-ink-soft">This expense will be saved as unpaid. Room balances will not change until it is marked as paid.</p>}
          </> : <>
            <div className="mt-3">
              <label className="label" htmlFor="qb-upi-app">Payment app</label>
              <select id="qb-upi-app" className="input" value={upiApp} onChange={(e) => setUpiApp(e.target.value as UpiApp)}>{UPI_APPS.map((app) => <option key={app.id} value={app.id}>{app.label}</option>)}</select>
            </div>
            <div className="mt-4 space-y-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {room?.demo ? (
                  <button type="button" onClick={() => savePurchase(true)} className="btn-primary w-full !py-3 sm:col-span-2"><Icon name="wallet" /> Simulate Payment</button>
                ) : (
                  <>
                    <button type="button" onClick={() => scannerOpen ? stopScanner() : startScanner()} className="btn-primary w-full !py-3 sm:col-span-2"><Icon name="scan" /> {scannerOpen ? 'Close seller QR scanner' : 'Scan Seller QR'}</button>
                    {directLink && <button type="button" onClick={() => launchInstantPay(directLink)} className="btn-outline w-full !py-3 sm:col-span-2"><Icon name="wallet" /> Open {UPI_APPS.find((app) => app.id === upiApp)?.label ?? 'UPI app'} with these details</button>}
                  </>
                )}
              </div>

              {scanMsg && <p className="text-[12.5px] font-semibold text-primary" role="status">{scanMsg}</p>}

              <details ref={payeeDetailsRef} className="rounded-xl border border-line-light bg-surface-card2 px-3.5 py-3">
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

              <p className="text-[12px] leading-relaxed text-ink-soft">
                When you return, RoomHisaab will ask you to confirm before saving. Check the seller name and amount in your UPI app. Never enter a UPI PIN on this website.
              </p>
            </div>
          </>}

          {error && <p className="mt-3 rounded-xl border border-overdue/30 bg-overdue/10 px-3.5 py-2.5 text-[13px] font-semibold text-overdue" role="alert">{error}</p>}

          <button type="button" disabled={saving} onClick={() => {
            if (pendingIntent && pendingIntent.roomId === room.id && entryMode === 'scan') completePendingPurchase(pendingIntent)
            else savePurchase(entryMode === 'scan')
          }} className="btn-accent w-full !py-3.5 !text-[16px] mt-4 disabled:cursor-wait disabled:opacity-60">
            <Icon name="check" /> {saving ? 'Saving Expense…' : entryMode === 'scan' ? (room.demo ? 'Simulate Payment — Save Expense' : pendingIntent?.roomId === room.id ? 'Yes, Save as Paid' : method === 'upi' ? 'I Completed the Payment — Save Expense' : 'I Paid Cash — Save Expense') : paymentStatus === 'unpaid' ? 'Save as Unpaid' : 'Save Expense'}{amountPaise ? ` · ${formatINR(amountPaise)}` : ''}
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
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A8A0FF]">Add Expense</p>
              <h2 id="seller-scanner-title" className="truncate text-[18px] text-white">{scanPhase === 'success' ? 'Seller found' : 'Scan seller QR'}</h2>
            </div>
            {cameraCaps?.torch && <button type="button" onClick={() => void toggleTorch()} aria-pressed={torchOn} className="min-h-[44px] rounded-xl border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white">{torchOn ? 'Flash On' : 'Flash'}</button>}
            {videoInputs.length > 1 && <button type="button" onClick={switchCamera} className="min-h-[44px] rounded-xl border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white" aria-label="Switch camera">Switch Camera</button>}
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80">{UPI_APPS.find((app) => app.id === upiApp)?.label ?? 'UPI app'}</span>
          </header>

          <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5">
            {scanPhase === 'scanning' ? (
              cameraFailure ? (
                <section className="relative z-10 mx-auto w-full max-w-sm rounded-3xl border border-white/15 bg-white/10 p-5 text-center" role="alert" aria-live="assertive">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5046C8]/35 text-[#C5C3E1]"><Icon name="scan" size={27} /></div>
                  <h3 className="mt-4 text-[20px] text-white">{cameraFailure === 'permission' ? 'Camera Access Is Blocked' : cameraFailure === 'unavailable' ? 'No Camera Found' : cameraFailure === 'busy' ? 'Camera Is Busy' : 'Scanner Could Not Start'}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/75">{scanMsg || cameraFailureMessage(cameraFailure)}</p>
                  {(cameraFailure === 'permission' || cameraFailure === 'busy' || cameraFailure === 'failed') && <button type="button" onClick={() => void startScanner()} className="btn-primary mx-auto mt-4 min-h-[44px] !px-5">Try Again</button>}
                </section>
              ) : (
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
                  {!cameraReady && <p className="absolute bottom-6 z-10 rounded-full bg-black/65 px-4 py-2 text-[12px] text-white" role="status">Requesting camera access…</p>}
                </>
              )
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
                <p className="text-[15px] font-semibold text-white">{cameraFailure ? 'Use another way to continue.' : cameraReady ? 'Place the QR inside the frame' : 'Opening the camera…'}</p>
                <p className="mt-1 text-[12.5px] text-white/65">{cameraFailure ? 'You can retry, upload a QR image, or enter the UPI ID manually.' : 'Move closer, hold steady, and use more light if needed.'}</p>
                {cameraCaps?.zoom && <div className="mx-auto mt-3 max-w-sm rounded-2xl border border-white/15 bg-black/30 p-3 text-left">
                  <div className="flex items-center justify-between gap-2"><label htmlFor="seller-qr-zoom" className="text-[12px] font-semibold text-white">Zoom · {cameraZoom.toFixed(1)}×</label><button type="button" onClick={() => void setZoomLevel(Math.max(1, cameraCaps.zoom!.min))} className="min-h-[40px] rounded-lg px-2 text-[11px] font-bold text-white">Reset</button></div>
                  <input id="seller-qr-zoom" type="range" min={cameraCaps.zoom.min} max={cameraCaps.zoom.max} step={cameraCaps.zoom.step ?? 0.1} value={cameraZoom} onChange={(event) => void setZoomLevel(Number(event.target.value))} className="w-full accent-[#A8A0FF]" aria-label="Camera zoom" />
                  <div className="flex flex-wrap gap-2">{[1, 2, 3].filter((value) => value >= cameraCaps.zoom!.min && value <= cameraCaps.zoom!.max).map((value) => <button key={value} type="button" className="min-h-[40px] rounded-xl border border-white/20 px-3 text-[12px] font-semibold text-white" onClick={() => void setZoomLevel(value)}>{value}×</button>)}</div>
                </div>}
                <div className="mx-auto mt-3 flex max-w-sm flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => galleryInputRef.current?.click()} className="min-h-[44px] rounded-xl border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white">Upload QR Image</button>
                  <button type="button" onClick={() => { setScannerOpen(false); if (payeeDetailsRef.current) payeeDetailsRef.current.open = true; window.setTimeout(() => document.getElementById('qb-payee-vpa')?.focus(), 50) }} className="min-h-[44px] rounded-xl border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white">Enter UPI ID Manually</button>
                  <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void decodeGalleryImage(file) }} aria-label="Upload a QR image" />
                </div>
                {scanMsg && <p className="mx-auto mt-3 max-w-sm text-[12px] leading-relaxed text-[#C5C3E1]" role="status" aria-live="polite">{scanMsg}</p>}
              </>
            ) : (
              <>
                <p className="text-[12.5px] text-white/70">Check the seller and amount before continuing.</p>
                {!room?.demo && directLink && <button type="button" onClick={() => { window.clearTimeout(scanAutoLaunchRef.current); setScannerOpen(false); launchInstantPay(directLink) }} className="btn-primary mx-auto mt-2 min-h-[44px] !px-5"><Icon name="wallet" size={17} /> Open {UPI_APPS.find((app) => app.id === upiApp)?.label ?? 'UPI app'}</button>}
              </>
            )}
          </footer>
        </div>
      )}
    </>
  )
}
