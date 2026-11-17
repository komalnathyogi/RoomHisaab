import type { CategoryId } from './types'

export interface ExpenseSuggestion {
  label: string
  aliases: readonly string[]
  category: CategoryId
}

/** Small local catalogue; it does not call an AI or external service. */
export const EXPENSE_SUGGESTIONS: readonly ExpenseSuggestion[] = [
  { label: 'Potato', aliases: ['aloo', 'alu', 'potatoes'], category: 'groceries' },
  { label: 'Onion', aliases: ['pyaz', 'pyaaz', 'onions'], category: 'groceries' },
  { label: 'Tomato', aliases: ['tamatar', 'tamatar'], category: 'groceries' },
  { label: 'Okra', aliases: ['bhindi', 'lady finger', 'ladyfinger'], category: 'groceries' },
  { label: 'Rice', aliases: ['chawal', 'chaawal'], category: 'groceries' },
  { label: 'Wheat flour', aliases: ['atta', 'aata', 'flour'], category: 'groceries' },
  { label: 'Milk', aliases: ['doodh', 'dudh'], category: 'groceries' },
  { label: 'Sugar', aliases: ['cheeni', 'chini'], category: 'groceries' },
  { label: 'Vegetables', aliases: ['sabzi', 'sabji', 'veggies'], category: 'groceries' },
  { label: 'Fruit', aliases: ['phal', 'fruits'], category: 'groceries' },
  { label: 'Groceries', aliases: ['rashan', 'ration', 'kirana'], category: 'groceries' },
  { label: 'Maggi', aliases: ['noodles', 'instant noodles'], category: 'food' },
  { label: 'Samosa', aliases: ['samosa', 'samosay'], category: 'food' },
  { label: 'Momos', aliases: ['momo'], category: 'food' },
  { label: 'Poha', aliases: ['pohe', 'flattened rice'], category: 'food' },
  { label: 'Biryani', aliases: ['biriyani'], category: 'food' },
  { label: 'Dinner', aliases: ['raat ka khana', 'dinner food'], category: 'food' },
  { label: 'Notebook', aliases: ['copy', 'notebook'], category: 'shopping' },
  { label: 'Pen', aliases: ['pen', 'ball pen'], category: 'shopping' },
  { label: 'Pencil', aliases: ['pencil', 'pencill'], category: 'shopping' },
  { label: 'Bucket', aliases: ['balti', 'bucket'], category: 'shopping' },
  { label: 'Soap', aliases: ['sabun', 'saabun'], category: 'shopping' },
  { label: 'Phone charger', aliases: ['charger', 'mobile charger'], category: 'shopping' },
  { label: 'Extension board', aliases: ['extension board', 'power strip'], category: 'shopping' },
  { label: 'Cleaning supplies', aliases: ['safai ka saman', 'cleaner', 'detergent'], category: 'maid' },
  { label: 'Electricity bill', aliases: ['bijli bill', 'electric bill'], category: 'electricity' },
  { label: 'WiFi bill', aliases: ['internet bill', 'wifi recharge'], category: 'wifi' },
  { label: 'Mobile recharge', aliases: ['phone recharge', 'mobile top up'], category: 'subscription' },
  { label: 'Bus fare', aliases: ['bus', 'bus ticket'], category: 'transport' },
  { label: 'Medicine', aliases: ['dawai', 'dawa', 'medicines'], category: 'medicine' },
  { label: 'Rent', aliases: ['kiraya', 'room rent'], category: 'rent' },
]

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ')
}

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + Number(i < a.length || j < b.length) <= 1
}

/** Prefix first, then alias substring, then single-edit typo match. */
export function suggestExpenseItems(query: string, limit = 6): ExpenseSuggestion[] {
  const q = normalize(query)
  if (!q) return []
  return EXPENSE_SUGGESTIONS.map((item, index) => {
    const words = [item.label, ...item.aliases].map(normalize)
    let score = 0
    for (const word of words) {
      if (word === q) score = Math.max(score, 100)
      else if (word.startsWith(q)) score = Math.max(score, 80)
      else if (word.includes(q)) score = Math.max(score, 60)
      else if (q.length >= 3 && (word.split(' ').some((part) => withinOneEdit(q, part)))) score = Math.max(score, 35)
    }
    return { item, index, score }
  }).filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Math.min(6, limit)))
    .map(({ item }) => item)
}
