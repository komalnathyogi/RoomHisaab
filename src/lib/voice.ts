// ─────────────────────────────────────────────────────────────
// VOICE EXPENSE PARSER — Hinglish / Hindi / English
// "Komal ne ek hazaar do sau chaalees ka bijli bill diya"
// → payer Komal · ₹1,240 · Bijli bill · Electricity
// Browser ki free SpeechRecognition se transcript aata hai;
// parsing poori local hai, koi server nahi.
// ─────────────────────────────────────────────────────────────

import type { CategoryId, Member, Method, ParsedTransaction } from './types'
import { detectMerchant } from './smsParser'

const SMALL: Record<string, number> = {
  zero: 0, shunya: 0, 'शून्य': 0,
  one: 1, ek: 1, 'एक': 1,
  two: 2, do: 2, 'दो': 2,
  three: 3, teen: 3, tin: 3, 'तीन': 3,
  four: 4, chaar: 4, char: 4, 'चार': 4,
  five: 5, paanch: 5, panch: 5, 'पाँच': 5, 'पांच': 5,
  six: 6, chhah: 6, chhe: 6, chah: 6, 'छह': 6,
  seven: 7, saat: 7, sat: 7, 'सात': 7,
  eight: 8, aath: 8, ath: 8, 'आठ': 8,
  nine: 9, nau: 9, 'नौ': 9,
  ten: 10, das: 10, 'दस': 10,
  eleven: 11, gyarah: 11, 'ग्यारह': 11,
  twelve: 12, barah: 12, 'बारह': 12,
  thirteen: 13, terah: 13, 'तेरह': 13,
  fourteen: 14, chaudah: 14, 'चौदह': 14,
  fifteen: 15, pandrah: 15, 'पंद्रह': 15,
  sixteen: 16, solah: 16, 'सोलह': 16,
  seventeen: 17, satrah: 17, 'सत्रह': 17,
  eighteen: 18, atharah: 18, 'अठारह': 18,
  nineteen: 19, unnees: 19, 'उन्नीस': 19,
  twenty: 20, bees: 20, bis: 20, 'बीस': 20,
  thirty: 30, tees: 30, tis: 30, 'तीस': 30,
  forty: 40, chaalees: 40, chalis: 40, 'चालीस': 40,
  fifty: 50, pachaas: 50, pachas: 50, 'पचास': 50,
  sixty: 60, saath: 60, sath: 60, 'साठ': 60,
  seventy: 70, sattar: 70, 'सत्तर': 70,
  eighty: 80, assi: 80, 'अस्सी': 80,
  ninety: 90, nabbe: 90, navve: 90, 'नब्बे': 90,
}

const SCALES: Record<string, number> = {
  hundred: 100, sau: 100, so: 100, 'सौ': 100,
  thousand: 1000, hazaar: 1000, hazar: 1000, 'हज़ार': 1000, 'हजार': 1000,
  lakh: 100000, lac: 100000, laakh: 100000, 'लाख': 100000,
  crore: 10000000, karod: 10000000, 'करोड़': 10000000, 'करोड': 10000000,
}

const NUMBER_WORDS = new Set([...Object.keys(SMALL), ...Object.keys(SCALES), 'and', 'aur', 'और'])
const CURRENCY_NEAR = new Set(['rupee', 'rupees', 'rupaye', 'rupay', 'rupya', 'rs', 'inr', '₹', 'रुपये', 'रुपए', 'रुपया', 'का', 'ki', 'ka', 'paid', 'diya', 'diye', 'kharcha', 'bill'])

function normalizeDigits(s: string) {
  const dev = '०१२३४५६७८९'
  return s.replace(/[०-९]/g, (d) => String(dev.indexOf(d)))
}

function tokensOf(s: string): string[] {
  return normalizeDigits(s.toLowerCase()).replace(/[₹,]/g, ' ').match(/[\p{L}\p{N}]+(?:\.\p{N}+)?/gu) ?? []
}

function parseNumberPhrase(tokens: string[], start: number): { value: number; end: number } | null {
  let total = 0
  let current = 0
  let seen = false
  let i = start

  // Special Hindi fractions: dedh sau = 150, dhai hazaar = 2500, saade paanch sau = 550
  const first = tokens[i]
  if ((first === 'dedh' || first === 'डेढ़' || first === 'dhai' || first === 'ढाई') && SCALES[tokens[i + 1]]) {
    const base = first === 'dedh' || first === 'डेढ़' ? 1.5 : 2.5
    return { value: base * SCALES[tokens[i + 1]], end: i + 2 }
  }
  if ((first === 'saade' || first === 'saadhe' || first === 'साढ़े') && SMALL[tokens[i + 1]] != null && SCALES[tokens[i + 2]]) {
    return { value: (SMALL[tokens[i + 1]] + 0.5) * SCALES[tokens[i + 2]], end: i + 3 }
  }

  while (i < tokens.length && i < start + 12) {
    const t = tokens[i]
    if (t === 'and' || t === 'aur' || t === 'और') { i++; continue }
    if (SMALL[t] != null) {
      current += SMALL[t]
      seen = true; i++; continue
    }
    if (SCALES[t]) {
      const scale = SCALES[t]
      if (scale === 100) current = (current || 1) * 100
      else { total += (current || 1) * scale; current = 0 }
      seen = true; i++; continue
    }
    break
  }
  const value = total + current
  return seen && value > 0 ? { value, end: i } : null
}

export function parseVoiceAmount(transcript: string): { paise: number; numeric: boolean; phrase: string } | null {
  const normalized = normalizeDigits(transcript).replace(/(\d),(?=\d)/g, '$1')
  const numeric = normalized.match(/(?:₹|rs\.?|inr|rupees?|rupaye?)?\s*(\d+(?:\.\d{1,2})?)\s*(?:rupees?|rupaye?|rs\.?|inr)?/i)
  if (numeric?.[1]) {
    const rupees = Number(numeric[1])
    if (Number.isFinite(rupees) && rupees > 0) return { paise: Math.round(rupees * 100), numeric: true, phrase: numeric[0].trim() }
  }

  const tokens = tokensOf(transcript)
  let best: { paise: number; numeric: false; phrase: string; score: number } | null = null
  for (let i = 0; i < tokens.length; i++) {
    if (!NUMBER_WORDS.has(tokens[i]) && !['dedh', 'dhai', 'saade', 'saadhe', 'डेढ़', 'ढाई', 'साढ़े'].includes(tokens[i])) continue
    const parsed = parseNumberPhrase(tokens, i)
    if (!parsed) continue
    const near = tokens.slice(Math.max(0, i - 3), Math.min(tokens.length, parsed.end + 3))
    let score = near.some((t) => CURRENCY_NEAR.has(t)) ? 40 : 0
    score += Math.min(30, String(Math.round(parsed.value)).length * 5)
    score += parsed.end - i
    const paise = Math.round(parsed.value * 100)
    if (!best || score > best.score) best = { paise, numeric: false, phrase: tokens.slice(i, parsed.end).join(' '), score }
  }
  return best
}

const CATEGORY_HINTS: { category: CategoryId; label: string; words: string[] }[] = [
  { category: 'rent', label: 'Rent', words: ['rent', 'kiraya', 'kiraye', 'किराया', 'मकान'] },
  { category: 'electricity', label: 'Electricity bill', words: ['bijli', 'electricity', 'light bill', 'बिजली'] },
  { category: 'wifi', label: 'WiFi bill', words: ['wifi', 'wi fi', 'broadband', 'internet', 'वाइफाई'] },
  { category: 'groceries', label: 'Groceries', words: ['rashan', 'grocery', 'groceries', 'kirana', 'sabzi', 'doodh', 'milk', 'aata', 'राशन', 'सब्ज़ी', 'सब्जी', 'दूध'] },
  { category: 'food', label: 'Food', words: ['khana', 'khaana', 'food', 'maggi', 'chai', 'pizza', 'burger', 'dinner', 'lunch', 'breakfast', 'nashta', 'खाना', 'चाय'] },
  { category: 'transport', label: 'Transport', words: ['auto', 'cab', 'ola', 'uber', 'metro', 'petrol', 'diesel', 'bus', 'train', 'transport', 'यात्रा'] },
  { category: 'maid', label: 'Maid / Cleaning', words: ['maid', 'kaamwali', 'safai', 'cleaning', 'सफाई'] },
  { category: 'gas', label: 'Gas cylinder', words: ['gas cylinder', 'cylinder', 'lpg', 'गैस'] },
  { category: 'water', label: 'Water', words: ['paani', 'water', 'पानी', 'water jar'] },
  { category: 'subscription', label: 'Subscription / Recharge', words: ['netflix', 'prime', 'spotify', 'recharge', 'subscription', 'रिचार्ज'] },
  { category: 'medicine', label: 'Medicine', words: ['dawai', 'medicine', 'pharmacy', 'medical', 'doctor', 'दवाई'] },
  { category: 'shopping', label: 'Shopping', words: ['shopping', 'kharidari', 'kapde', 'shoes', 'खरीदारी'] },
]

function titleCase(s: string) {
  return s.trim().replace(/\s+/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase()).slice(0, 64)
}

function cleanDescription(transcript: string, payer?: Member): string {
  let s = ` ${transcript.trim()} `
  if (payer?.name) s = s.replace(new RegExp(`\\b${payer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+ne\\b`, 'i'), ' ')
  if (payer?.fullName) s = s.replace(new RegExp(`\\b${payer.fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+ne\\b`, 'i'), ' ')
  s = s
    .replace(/\b(maine|i have paid|i paid|i)\b/gi, ' ')
    .replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
    .replace(/(?:₹|rs\.?|inr|rupees?|rupaye?)?\s*\d+(?:\.\d{1,2})?\s*(?:rupees?|rupaye?|rs\.?|inr)?/gi, ' ')
    .replace(/\b(ka|ki|ke|ko|paid|pay|diya|diye|liya|liye|khareeda|khareedi|bought|order|kiya|expense|kharcha|add karo|add kar do)\b/gi, ' ')
  const words = tokensOf(s).filter((t) => !NUMBER_WORDS.has(t) && !CURRENCY_NEAR.has(t))
  return titleCase(words.join(' ')) || 'Voice expense'
}

export function parseVoiceExpense(transcript: string, members: Member[], meId?: string): ParsedTransaction | null {
  const raw = transcript.trim()
  if (!raw) return null
  const amount = parseVoiceAmount(raw)
  if (!amount) return null
  const lower = normalizeDigits(raw.toLowerCase())
  const tokens = tokensOf(raw)

  let payer: Member | undefined
  if (/\b(maine|i paid|i have paid)\b/.test(lower) || raw.includes('मैंने')) payer = members.find((m) => m.id === meId) ?? members[0]
  else {
    payer = members
      .filter((m) => !m.isVirtual)
      .sort((a, b) => (b.fullName?.length ?? b.name.length) - (a.fullName?.length ?? a.name.length))
      .find((m) => {
        const candidates = [m.name, m.fullName].filter(Boolean).map((x) => x!.toLowerCase())
        return candidates.some((name) => lower.includes(name) || name.split(/\s+/).some((part) => part.length > 2 && tokens.includes(part)))
      })
  }

  const merchant = detectMerchant(raw)
  const hinted = CATEGORY_HINTS.find((h) => h.words.some((w) => lower.includes(w)))
  const category = (merchant?.category as CategoryId | undefined) ?? hinted?.category ?? 'other'
  const description = merchant?.display ?? hinted?.label ?? cleanDescription(raw, payer)
  const method: Method = /\b(cash|nakad|नकद)\b/.test(lower) || raw.includes('नकद') ? 'cash' : /\b(card|credit card|debit card)\b/.test(lower) ? 'card' : 'upi'

  let confidence = 62
  confidence += amount.numeric ? 17 : 11
  if (payer) confidence += 9
  if (merchant || hinted) confidence += 8
  if (/\b(ne|paid|diya|khareeda|liya)\b/.test(lower)) confidence += 3

  return {
    amountPaise: amount.paise,
    direction: 'debit',
    merchant: description,
    merchantKey: description.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28) || 'VOICE',
    bank: 'Voice',
    date: Date.now(),
    methodGuess: method,
    confidence: Math.min(confidence, 96),
    suggestedCategory: category,
    payerId: payer?.id,
  }
}

export const VOICE_SAMPLES = [
  'Komal paid one thousand two hundred forty rupees for the electricity bill',
  'I paid five hundred rupees for groceries',
  'Amit paid 799 rupees for WiFi',
]
