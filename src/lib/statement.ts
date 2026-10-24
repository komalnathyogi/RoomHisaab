// ─────────────────────────────────────────────────────────────
// ⭐ BANK STATEMENT CSV PARSER
// Net-banking / bank app se export ki gayi CSV daalo →
// saare debit transactions ek saath Inbox me (bulk automatic).
// SBI/HDFC/ICICI/Axis/Kotak ke common column names handle karta hai.
// Sirf browser me chalta hai — file kahin upload nahi hoti.
// ─────────────────────────────────────────────────────────────
import type { ParsedTransaction } from './types'
import { parseBankSMS, detectMerchant } from './smsParser'
import { parseRupeesToPaise } from './money'

function splitCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ
    } else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  out.push(cur.trim())
  return out
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function findCol(headers: string[], names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex((h) => norm(h) === name || norm(h).includes(name))
    if (idx !== -1) return idx
  }
  return -1
}

function parseDateLoose(s: string): number | null {
  if (!s) return null
  const t = s.trim()
  const m = t.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/)
  if (m) {
    let y = parseInt(m[3], 10)
    if (y < 100) y += y > 60 ? 1900 : 2000
    const dt = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10), 12)
    return Number.isNaN(dt.getTime()) ? null : dt.getTime()
  }
  const m2 = t.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (m2) {
    const dt = new Date(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, parseInt(m2[3], 10), 12)
    return Number.isNaN(dt.getTime()) ? null : dt.getTime()
  }
  const parsed = Date.parse(t)
  return Number.isNaN(parsed) ? null : parsed
}

export interface StatementResult {
  transactions: ParsedTransaction[]
  rows: number
  creditsSkipped: number
  error?: string
}

/** CSV text -> sirf DEBIT (kharcha) transactions */
export function parseStatementCSV(csv: string): StatementResult {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return { transactions: [], rows: 0, creditsSkipped: 0, error: 'The CSV appears to be empty.' }

  // header wali line dhoondho (upar bank ki faltu lines ho sakti hain)
  let headerIdx = -1
  let headers: string[] = []
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const cols = splitCSVLine(lines[i])
    const joined = cols.map(norm).join(' | ')
    if (/(date|narration|description|particular|debit|credit|amount|withdrawal|deposit)/.test(joined)) {
      headerIdx = i; headers = cols; break
    }
  }
  if (headerIdx === -1) {
    return { transactions: [], rows: 0, creditsSkipped: 0, error: 'Required CSV columns were not found. Date, description and debit columns are needed.' }
  }

  const iDate = findCol(headers, ['txn date', 'transaction date', 'value date', 'date'])
  const iDesc = findCol(headers, ['narration', 'description', 'particulars', 'particular', 'transaction details', 'details', 'remarks', 'merchant'])
  const iDebit = findCol(headers, ['debit amount', 'withdrawal amount', 'withdrawal', 'debit', 'dr'])
  const iCredit = findCol(headers, ['credit amount', 'deposit amount', 'deposit', 'credit', 'cr'])
  const iAmt = findCol(headers, ['amount', 'txn amount', 'transaction amount'])
  const iType = findCol(headers, ['type', 'dr cr', 'transaction type'])

  if (iDesc === -1 && iDebit === -1 && iAmt === -1) {
    return { transactions: [], rows: 0, creditsSkipped: 0, error: 'The amount or description column could not be recognized. Use the official bank CSV export.' }
  }

  const txns: ParsedTransaction[] = []
  let credits = 0
  let rows = 0

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i])
    if (cols.length < 2) continue
    rows++
    const desc = (iDesc >= 0 ? cols[iDesc] : '') || 'Bank transaction'
    const dateTxt = iDate >= 0 ? cols[iDate] : ''
    const date = parseDateLoose(dateTxt)

    let paise: number | null = null
    let isDebit = true

    const debitTxt = iDebit >= 0 ? cols[iDebit] : ''
    const creditTxt = iCredit >= 0 ? cols[iCredit] : ''
    const debitVal = debitTxt ? parseRupeesToPaise(debitTxt.replace(/[()]/g, '')) : null
    const creditVal = creditTxt ? parseRupeesToPaise(creditTxt.replace(/[()]/g, '')) : null

    if (debitVal && debitVal > 0) { paise = debitVal; isDebit = true }
    else if (creditVal && creditVal > 0) { paise = creditVal; isDebit = false }
    else if (iAmt >= 0 && cols[iAmt]) {
      const raw = cols[iAmt].trim()
      paise = parseRupeesToPaise(raw.replace(/[()]/g, '').replace(/^-/, ''))
      const typeTxt = `${iType >= 0 ? cols[iType] : ''} ${desc}`.toLowerCase()
      isDebit = !(/credit|cr\b|refund|salary|received/.test(typeTxt) || raw.startsWith('+'))
      if (raw.startsWith('-') || /^\(.*\)$/.test(raw)) isDebit = true
    }

    if (!paise || paise <= 0) continue
    if (!isDebit) { credits++; continue }

    // narration ko SMS-style text bana ke existing parser ka merchant brain reuse karo
    const synthetic = `Rs ${paise / 100} debited towards ${desc}${dateTxt ? ` on ${dateTxt}` : ''}`
    const fromParser = parseBankSMS(synthetic)
    const known = detectMerchant(desc)
    const merchant = known?.display ?? fromParser?.merchant ?? desc.slice(0, 42)
    const merchantKey = known?.key ?? fromParser?.merchantKey ??
      merchant.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) ?? 'UNKNOWN'

    txns.push({
      amountPaise: paise,
      direction: 'debit',
      merchant,
      merchantKey: merchantKey || 'UNKNOWN',
      bank: 'STATEMENT',
      date,
      methodGuess: /upi/i.test(desc) ? 'upi' : /card|pos/i.test(desc) ? 'card' : (known?.method ?? 'upi'),
      confidence: known ? 96 : 82,
      suggestedCategory: (known?.category as ParsedTransaction['suggestedCategory']) ?? fromParser?.suggestedCategory ?? 'other',
    })
  }

  return { transactions: txns, rows, creditsSkipped: credits }
}

/** chhota sample — test + user ko format dikhane ke liye */
export const SAMPLE_STATEMENT_CSV = `Date,Narration,Debit Amount,Credit Amount,Balance
15/10/2026,UPI/SWIGGY/423456,500.00,,12450.00
14/10/2026,POS BIGBASKET.COM,1250.75,,12950.00
13/10/2026,SALARY CREDIT ACME,,45000.00,57450.00
12/10/2026,UPI/ZOMATO/4231,350.00,,57100.00
10/10/2026,UPI/RAPIDO,200.00,,56900.00`
