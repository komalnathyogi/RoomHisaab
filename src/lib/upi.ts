// ─────────────────────────────────────────────────────────────
// UPI DEEP-LINK — NPCI linking specification ke hisab se.
// Format: upi://pay?pa=VPA&pn=Name&am=Amount&cu=INR&tn=Note&tr=Ref
//  - pa (payee VPA) + pn (payee name) MANDATORY hain.
//  - VPA na ho to link kaam nahi karega — isliye hum fake link NAHI banate,
//    null return karke UI ko bolte hain "UPI ID add karo".
// Tap karte hi phone pe GPay/PhonePe/Paytm/BHIM khulta hai, amount pre-filled.
// ─────────────────────────────────────────────────────────────

import type { UpiApp } from './types'

export const UPI_APPS: { id: UpiApp; label: string; hint: string }[] = [
  { id: 'any', label: 'Any UPI app', hint: 'Opens the phone app chooser' },
  { id: 'gpay', label: 'Google Pay', hint: 'Use Google Pay' },
  { id: 'phonepe', label: 'PhonePe', hint: 'Use PhonePe' },
  { id: 'paytm', label: 'Paytm', hint: 'Use Paytm' },
  { id: 'bhim', label: 'BHIM', hint: 'Use BHIM' },
  { id: 'navi', label: 'Navi UPI', hint: 'Use Navi UPI' },
]

const APP_SCHEME: Record<UpiApp, string> = {
  any: 'upi://pay',
  gpay: 'tez://upi/pay',
  phonepe: 'phonepe://pay',
  paytm: 'paytmmp://upi/pay',
  bhim: 'bhim://upi://pay',
  navi: 'navipay://pay',
}

export interface UpiLinkInput {
  payeeVpa?: string      // amit@okhdfcbank — mandatory for a working link
  payeeName: string
  amountPaise: number
  note?: string
  ref?: string           // transaction reference (tr)
  app?: UpiApp           // QR ke liye hamesha generic; button ke liye app-specific
}

/** VPA format sahi hai ya nahi — naam@bank */
export function isValidVpa(vpa?: string): boolean {
  if (!vpa) return false
  return /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa.trim())
}

const cleanRef = (r?: string) =>
  (r ?? `RH${Date.now().toString(36).toUpperCase()}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 35) || `RH${Date.now()}`

/**
 * ⭐ Working UPI payment link. VPA missing/invalid ho to null
 * (UI me "UPI ID add karo" dikhana chahiye — nakli button nahi).
 */
export function buildUpiLink({ payeeVpa, payeeName, amountPaise, note, ref, app = 'any' }: UpiLinkInput): string | null {
  if (!isValidVpa(payeeVpa)) return null
  if (!amountPaise || amountPaise <= 0) return null
  const params = new URLSearchParams()
  params.set('pa', payeeVpa!.trim().toLowerCase())
  params.set('pn', payeeName.trim().slice(0, 50) || 'RoomHisaab')
  params.set('am', (amountPaise / 100).toFixed(2))
  params.set('cu', 'INR')
  params.set('tn', (note ?? 'RoomHisaab settle up').slice(0, 50))
  params.set('tr', cleanRef(ref))
  return `${APP_SCHEME[app]}?${params.toString()}`
}


const ANDROID_UPI_PACKAGES: Partial<Record<UpiApp, string>> = {
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm',
  bhim: 'in.org.npci.upiapp',
  navi: 'com.naviapp',
}

/** Build a mobile-friendly app launch URL. Android uses a package-targeted UPI intent; other platforms use the app scheme. */
export function buildUpiLaunchLink(input: UpiLinkInput, userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): string | null {
  const generic = buildUpiLink({ ...input, app: 'any' })
  if (!generic) return null
  const app = input.app ?? 'any'
  if (app === 'any') return generic
  if (/Android/i.test(userAgent)) {
    const packageName = ANDROID_UPI_PACKAGES[app]
    if (packageName) return `intent://pay?${generic.split('?')[1]}#Intent;scheme=upi;package=${packageName};end`
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) return buildUpiLink(input) ?? generic
  return generic
}

/**
 * QR-code ke liye wahi string (upi://pay?...).
 * QR image hum kisi bahar ki API se nahi banate — UPI link private rehta hai.
 */
export function upiQrPayload(input: UpiLinkInput): string | null {
  // QR universal hona chahiye — isliye app-specific scheme kabhi nahi
  return buildUpiLink({ ...input, app: 'any' })
}

export interface ParsedUpiQr {
  payeeVpa: string
  payeeName: string
  amountPaise?: number
  note?: string
}

/** Shop/person ke UPI QR text se VPA, naam aur amount nikalo (Quick Buy scanner ke liye). */
export function parseUpiQr(text: string): ParsedUpiQr | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  if (isValidVpa(raw)) return { payeeVpa: raw.toLowerCase(), payeeName: 'UPI payee' }
  try {
    const normalized = raw.replace(/^upi:\/\/pay/i, 'upi://pay')
    const url = new URL(normalized)
    const q = url.searchParams
    const pa = q.get('pa') ?? q.get('payeeVpa') ?? ''
    if (!isValidVpa(pa)) return null
    const am = Number(q.get('am') ?? q.get('amount') ?? '')
    return {
      payeeVpa: pa.trim().toLowerCase(),
      payeeName: (q.get('pn') ?? q.get('payeeName') ?? 'UPI payee').trim() || 'UPI payee',
      amountPaise: Number.isFinite(am) && am > 0 ? Math.round(am * 100) : undefined,
      note: (q.get('tn') ?? q.get('note') ?? undefined)?.trim() || undefined,
    }
  } catch {
    const m = raw.match(/[?&]pa=([^&\s]+)/i)
    if (!m) return null
    const pa = decodeURIComponent(m[1])
    if (!isValidVpa(pa)) return null
    const get = (k: string) => {
      const mm = raw.match(new RegExp(`[?&]${k}=([^&\\s]+)`, 'i'))
      return mm ? decodeURIComponent(mm[1].replace(/\+/g, ' ')) : ''
    }
    const am = Number(get('am'))
    return {
      payeeVpa: pa.toLowerCase(),
      payeeName: get('pn') || 'UPI payee',
      amountPaise: Number.isFinite(am) && am > 0 ? Math.round(am * 100) : undefined,
      note: get('tn') || undefined,
    }
  }
}

/** Payee details na ho to payment app kholne ka best-effort link — user wahi shop QR scan karega. */
export function upiScannerLink(app: UpiApp = 'any'): string {
  return APP_SCHEME[app]
}

/** WhatsApp click-to-chat reminder — auto-settle assistant ke liye */
export function buildWhatsAppLink(phone: string | undefined, message: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const full = digits && !digits.startsWith('91') ? `91${digits}` : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`
}

export function settleReminderMessage(
  fromName: string,
  toName: string,
  amountPaise: number,
  upiLink?: string | null,
): string {
  const amt = `₹${(amountPaise / 100).toLocaleString('en-IN')}`
  const base = `Hi ${fromName},\n\nRoomHisaab shows *${amt}* pending from you to *${toName}*. Please check the name and amount in your UPI app before you pay.`
  return upiLink
    ? `${base}\n\nPayment link:\n${upiLink}\n\nAfter completing the payment, please return to RoomHisaab and confirm it. This message is a payment request, not a payment receipt.`
    : `${base}\n\nPlease pay by UPI or cash. After completing the payment, please confirm it in RoomHisaab. This message is a payment request, not a payment receipt.`
}
