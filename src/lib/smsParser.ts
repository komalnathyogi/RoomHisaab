// ─────────────────────────────────────────────────────────────
// ⭐ BANK SMS PARSER  — automation ka sabse bada hissa
// Asli bank/UPI SMS paste karo → amount + merchant + direction khud nikal aayega.
// 100% browser me chalta hai. Koi server, koi API key, koi paisa nahi.
// ─────────────────────────────────────────────────────────────
import type { Method, ParsedTransaction } from './types'

const DEBIT_WORDS = ['debited', 'debit', 'spent', 'paid', 'payment', 'purchase', 'withdrawn', 'sent', 'deducted', 'dr ', '/dr', 'transferred']
const CREDIT_WORDS = ['credited', 'credit', 'received', 'refund', 'deposited', 'cr ', '/cr', 'cashback']

/** bank detect — SMS ke sender naam ya keywords se */
const BANKS: { key: string; patterns: RegExp[] }[] = [
  { key: 'SBI',          patterns: [/\bSBI\b/i, /state bank/i, /onlinesbi/i] },
  { key: 'HDFC',         patterns: [/\bHDFC\b/i] },
  { key: 'ICICI',        patterns: [/\bICICI\b/i] },
  { key: 'AXIS',         patterns: [/\bAXIS\b/i] },
  { key: 'KOTAK',        patterns: [/\bKOTAK\b/i, /kotak mahindra/i] },
  { key: 'BOB',          patterns: [/\bBOB\b/i, /bank of baroda/i] },
  { key: 'PNB',          patterns: [/\bPNB\b/i, /punjab national/i] },
  { key: 'YES BANK',     patterns: [/yes bank/i] },
  { key: 'INDIAN BANK',  patterns: [/indian bank/i, /\bIOB\b/i] },
  { key: 'CANARA',       patterns: [/canara/i] },
  { key: 'UNION BANK',   patterns: [/union bank/i] },
  { key: 'PAYTM',        patterns: [/paytm/i] },
  { key: 'PHONEPE',      patterns: [/phonepe/i, /\bPPE\b/i] },
  { key: 'GOOGLE PAY',   patterns: [/google pay/i, /\bGPay\b/i, /\bGTE\b/i, /\bGOOG\b/i] },
  { key: 'AMAZON PAY',   patterns: [/amazon pay/i] },
  { key: 'WHATSAPP PAY', patterns: [/whatsapp pay/i] },
]

/** merchant alias → category + normalised key (merchant memory isi pe chalti hai) */
export const MERCHANT_ALIASES: { match: RegExp; key: string; display: string; category: string; method?: Method }[] = [
  { match: /swiggy/i,              key: 'SWIGGY',      display: 'Swiggy',        category: 'food' },
  { match: /zomato/i,              key: 'ZOMATO',      display: 'Zomato',        category: 'food' },
  { match: /blink ?it/i,           key: 'BLINKIT',     display: 'Blinkit',       category: 'groceries' },
  { match: /zepto/i,               key: 'ZEPTO',       display: 'Zepto',         category: 'groceries' },
  { match: /big ?basket/i,         key: 'BIGBASKET',   display: 'BigBasket',     category: 'groceries' },
  { match: /dmart|darth ?mart/i,   key: 'DMART',       display: 'DMart',         category: 'groceries' },
  { match: /jio ?mart/i,           key: 'JIOMART',     display: 'JioMart',       category: 'groceries' },
  { match: /amazon/i,              key: 'AMAZON',      display: 'Amazon',        category: 'shopping' },
  { match: /flipkart|myntra/i,     key: 'FLIPKART',    display: 'Flipkart',      category: 'shopping' },
  { match: /meesho/i,              key: 'MEESHO',      display: 'Meesho',        category: 'shopping' },
  { match: /uber/i,                key: 'UBER',        display: 'Uber',          category: 'transport' },
  { match: /\bola\b|olacabs/i,     key: 'OLA',         display: 'Ola',           category: 'transport' },
  { match: /rapido/i,              key: 'RAPIDO',      display: 'Rapido',        category: 'transport' },
  { match: /irctc|indian rail/i,   key: 'IRCTC',       display: 'IRCTC',         category: 'transport' },
  { match: /indigo|vistara|air ?india|go ?first|spice ?jet/i, key: 'FLIGHT', display: 'Flight ticket', category: 'transport' },
  { match: /jio|airtel|vi\b|vodafone|bsnl/i, key: 'MOBILE_RECHARGE', display: 'Mobile recharge', category: 'subscription' },
  { match: /netflix/i,             key: 'NETFLIX',     display: 'Netflix',       category: 'subscription' },
  { match: /hotstar|disney/i,      key: 'HOTSTAR',     display: 'Hotstar',       category: 'subscription' },
  { match: /prime video|spotify|youtube ?premium/i, key: 'STREAMING', display: 'Streaming', category: 'subscription' },
  { match: /apollo|medplus|netmeds|1mg|pharmeasy/i, key: 'PHARMACY', display: 'Pharmacy', category: 'medicine' },
  { match: /electricity|bijli|mseb|mpseb|bescom|mse ?board/i, key: 'ELECTRICITY', display: 'Electricity bill', category: 'electricity' },
  { match: /gas cylinder|indane|hp ?gas|bharat ?gas/i, key: 'LPG', display: 'Gas cylinder', category: 'gas' },
  { match: /atm|cash ?withdraw/i,  key: 'ATM_CASH',    display: 'ATM cash',      category: 'other', method: 'cash' },
]

export function detectMerchant(text: string): { key: string; display: string; category: string; method?: Method } | null {
  for (const a of MERCHANT_ALIASES) if (a.match.test(text)) return a
  return null
}

/** free-form merchant naam nikaalna — "to X", "at X", "towards X", "VPA X" */
function extractMerchantPhrase(text: string): string | null {
  const patterns = [
    /(?:towards|to|at|paid to|sent to|payment to|vpa|upi[-\/ ]?(?:dr|cr)?[-\/ ]*)\s*([a-z0-9][a-z0-9 &.'\-]{2,38})/i,
    /(?:info|desc|narration|remark)[:\s]+([a-z0-9][a-z0-9 &.'\-]{2,38})/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (!m) continue
    let raw = m[1]
      .replace(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/g, '')       // dates (09-10-26) hatao
      .split(/\s+(?:via|using|through|from|on|ref)\b/i)[0]    // "via UPI" ke pehle rook do
      .replace(/\b(upi|neft|imps|pos|txn|ref|no|on|dated|a\/c|acct|avl|bal|balance|rs|inr|cr|dr)\b/gi, '')
      .replace(/[\d]{4,}/g, '')                 // lambi number strings (UPI ref / VPA digits)
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+/gi, '') // VPA emails hatao
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/[.,;:]+$/, '')
    if (raw.length >= 3) return raw
  }
  return null
}

/** saare amount candidates nikaalo — balance wale ko ignore karna zaroori hai */
function extractAmount(text: string): number | null {
  const all: { val: number; idx: number; nearDebit: boolean }[] = []
  const re = /(?:rs\.?|inr\.?|₹|rupees)\s*([\d]{1,9}(?:,\d{2,3})*(?:\.\d{1,2})?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const val = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100)
    if (!Number.isFinite(val) || val <= 0) continue
    const ctx = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase()
    const nearDebit = DEBIT_WORDS.some((w) => ctx.includes(w))
    all.push({ val, idx: m.index, nearDebit })
  }
  // bare "500.00 debited" style (bina Rs ke)
  if (!all.length) {
    const re2 = /([\d]{1,7}(?:,\d{2,3})*(?:\.\d{1,2})?)\s*(?:\/?-|debited|spent|paid|credited)/gi
    while ((m = re2.exec(text)) !== null) {
      const val = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100)
      if (Number.isFinite(val) && val > 0) all.push({ val, idx: m.index, nearDebit: true })
    }
  }
  if (!all.length) return null
  const isBalanceCtx = (idx: number) => {
    const after = text.slice(idx, idx + 40).toLowerCase()
    return /(avl bal|available bal|balance|bal:|a\/c bal|updated bal|live bal)/.test(after)
  }
  const filtered = all.filter((a) => !isBalanceCtx(a.idx))
  const pool = filtered.length ? filtered : all
  const debitFirst = pool.find((a) => a.nearDebit)
  return (debitFirst ?? pool[0]).val
}

function extractDate(text: string): number | null {
  const m = text.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/)
  if (!m) return null
  const [, a, b, yRaw] = m
  let year = parseInt(yRaw, 10)
  if (year < 100) year += year > 60 ? 1900 : 2000
  const d1 = parseInt(a, 10), d2 = parseInt(b, 10)
  // Indian format DD-MM-YYYY (agar d1 > 12 to pakka date hai)
  const day = d1 > 12 ? d1 : d1
  const month = (d1 > 12 ? d2 : d2) - 1
  const dt = new Date(year, month, day, 12, 0, 0, 0)
  return Number.isNaN(dt.getTime()) ? null : dt.getTime()
}

function detectBank(text: string): string {
  for (const b of BANKS) if (b.patterns.some((p) => p.test(text))) return b.key
  return 'UNKNOWN'
}

export interface ParseResult extends ParsedTransaction {
  ok: boolean
  reason?: string
}

/** ⭐ MAIN PARSER — yeh function landing page demo me bhi use hota hai */
export function parseBankSMS(raw: string): ParseResult | null {
  if (!raw || raw.trim().length < 8) return null
  const text = raw.replace(/\s+/g, ' ').trim()
  const lower = text.toLowerCase()

  const amountPaise = extractAmount(text)
  if (amountPaise === null) return null

  const isCredit = CREDIT_WORDS.some((w) => lower.includes(w)) && !DEBIT_WORDS.some((w) => lower.includes(w))
  const direction: 'debit' | 'credit' = isCredit ? 'credit' : 'debit'

  const known = detectMerchant(text)
  const phrase = extractMerchantPhrase(text)
  const merchant: string = known?.display ?? phrase ?? 'Unknown'
  const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
  const merchantKey: string = known?.key ?? (phrase ? slug(phrase) : 'UNKNOWN')
  const suggestedCategory: string = known?.category ?? 'other'

  let methodGuess: Method = 'upi'
  if (/\bupi\b|vpa|@\w+|gpay|phonepe|paytm|google pay/i.test(text)) methodGuess = 'upi'
  else if (/\bcard\b|\bpos\b|credit card|debit card|\bswipe\b/i.test(text)) methodGuess = 'card'
  else if (known?.method) methodGuess = known.method
  else if (/\batm|cash ?withdraw/i.test(text)) methodGuess = 'cash'

  // confidence scoring — honest badge ke liye
  let confidence = 45
  if (amountPaise) confidence += 25
  if (known) confidence += 18
  else if (phrase) confidence += 10
  if (detectBank(text) !== 'UNKNOWN') confidence += 7
  if (extractDate(text)) confidence += 5
  confidence = Math.min(99, confidence)

  return {
    ok: true,
    amountPaise,
    direction,
    merchant,
    merchantKey: merchantKey || 'UNKNOWN',
    bank: detectBank(text),
    date: extractDate(text),
    txnRef: (text.match(/\b([A-Z0-9]{8,20})\b/) ?? [])[1],
    methodGuess,
    suggestedCategory,
    confidence,
  } as ParseResult
}

/** dedupe — same (merchant, amount, date) dobara count na ho */
export function dedupeKey(t: ParsedTransaction): string {
  const day = t.date ? new Date(t.date).toDateString() : 'nodate'
  return `${t.merchantKey}|${t.amountPaise}|${day}`
}

/** test SMS samples — README aur landing demo me use hote hain */
export const SAMPLE_SMS = [
  'SBI: Rs.500.00 debited from a/c XX1234 on 15-10-26 to UPI 423456789012 SWIGGY LIMITED. Avl Bal Rs.12,450.00',
  'HDFC: Rs.1,250.75 spent on HDFC Bank Debit Card xx4321 at BIGBASKET.COM on 14/10/26. Info:BIGBASKET',
  'ICICI Bank A/c XX5678 debited Rs 350.00 on 12-10-2026 towards UPI-ZOMATO-4231. Avl bal Rs 8,210.50',
  'AXIS: Rs 200 debited from A/c ***9012 on 10-10-26 towards UPI/42345/RAPIDO. Bal Rs 3,120',
  'You paid Rs 300.00 to AMIT SHARMA via UPI on 09-10-26. Ref 4234567890',
  'Kotak: Rs 1,850.00 debited a/c xx3456 on 05-10-26 towards MSEDCL ELECTRICITY BILL. Avl Bal Rs 22,000',
]
