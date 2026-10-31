// ─────────────────────────────────────────────────────────────
// PAISA MATH — isko chhedna mat. Yahi app ki jaan hai.
// Rule: amount HAMESHA paise (integer) me. Display pe hi ₹ format.
// ─────────────────────────────────────────────────────────────

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 45050 -> "₹450.50"   |   45000 -> "₹450" (clean, no .00) */
export function formatINR(paise: number): string {
  const p = Math.round(paise)
  return p % 100 === 0 ? inr.format(p / 100) : inrPaise.format(p / 100)
}

/** "1,250.75" / "1250" / "₹1250" -> 125075 (paise). Galat input -> null */
export function parseRupeesToPaise(input: string): number | null {
  if (!input) return null
  const cleaned = input.replace(/[₹,\s]/g, '').trim()
  if (!cleaned) return null
  if (!/^\d*\.?\d{0,2}$/.test(cleaned)) return null
  const [rupeePart, paisaPart = ''] = cleaned.split('.')
  const rupees = parseInt(rupeePart || '0', 10)
  const paise = parseInt((paisaPart + '00').slice(0, 2), 10)
  const total = rupees * 100 + paise
  if (!Number.isFinite(total) || total < 0) return null
  return total
}

/** paise -> "1250.50" (input field ke liye) */
export function paiseToInputValue(paise: number): string {
  const p = Math.round(paise)
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2)
}

/**
 * ⭐ LARGEST-REMAINDER SPLIT
 * ₹1000 ko 3 log me baanto -> 333.34 / 333.33 / 333.33 = exactly ₹1000.
 * Naive 333.33*3 = ₹999.99 ❌ — 1 paisa gayab. Yeh bug fix hai.
 */
export function splitEqual(totalPaise: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(totalPaise / n)
  let remainder = totalPaise - base * n
  const out = new Array(n).fill(base)
  // bacha hua paisa pehle walo ko ek-ek karke do (deterministic)
  for (let i = 0; i < remainder; i++) out[i] += 1
  remainder = 0
  return out
}

/** percent se split — sum hamesha totalPaise ke barabar (rounding fix ke saath) */
export function splitByPercent(totalPaise: number, percents: number[]): number[] {
  const sum = percents.reduce((a, b) => a + b, 0)
  if (sum <= 0) return percents.map(() => 0)
  const raw = percents.map((p) => (totalPaise * p) / sum)
  const floors = raw.map(Math.floor)
  let left = totalPaise - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < left; k++) floors[order[k % order.length].i] += 1
  left = 0
  return floors
}

/** weights se split (jaise "Amit ne double khaya") */
export function splitByWeight(totalPaise: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  return splitByPercent(totalPaise, weights)
}

export function sumPaise(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** chhota helper: number ko 2 decimal tak safe round */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** percent change with sign — insights trend arrows ke liye */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}
