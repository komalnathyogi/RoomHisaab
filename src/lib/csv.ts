import type { Expense, Member, Settlement } from './types'
import { catOf } from './constants'
import { paiseToInputValue } from './money'

const d = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })

function esc(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function expensesToCSV(expenses: Expense[], members: Member[]): string {
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id
  const head = ['Date', 'Description', 'Category', 'Amount(INR)', 'Payer', 'Method', 'Split', 'Source', 'Status']
  const rows = [...expenses]
    .filter((e) => !e.deleted)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((e) => [
      d(e.createdAt),
      e.description,
      catOf(e.category).label,
      paiseToInputValue(e.amountPaise),
      name(e.payerId),
      e.method.toUpperCase(),
      e.splits.map((s) => `${name(s.memberId)}:${paiseToInputValue(s.paise)}`).join(' | '),
      e.source,
      e.status,
    ])
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n')
}

export function settlementsToCSV(rows: Settlement[], members: Member[]): string {
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id
  const head = ['Date', 'From', 'To', 'Amount(INR)', 'Method', 'ConfirmedBy']
  const body = rows.map((s) => [d(s.createdAt), name(s.fromId), name(s.toId), paiseToInputValue(s.amountPaise), s.method.toUpperCase(), s.confirmedBy.map(name).join(' + ')])
  return [head, ...body].map((r) => r.map(esc).join(',')).join('\n')
}

/** ⭐ WhatsApp-ready plain text statement — India me hisaab yahi maanga jaata hai */
export function statementText(opts: {
  roomName: string
  periodLabel: string
  totalPaise: number
  debts: { from: string; to: string; paise: number }[]
  topCategories: { label: string; icon: string; paise: number }[]
  perMember: { name: string; paid: number; owed: number; net: number }[]
}): string {
  const r = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`
  const L: string[] = []
  L.push(`🏠 *${opts.roomName}* — Hisaab (${opts.periodLabel})`)
  L.push(`━━━━━━━━━━━━━━━`)
  L.push(`Total expenses: *${r(opts.totalPaise)}*`)
  L.push('')
  L.push('*Member summary:*')
  if (!opts.debts.length) L.push('All balances are settled.')
  else opts.debts.forEach((d) => L.push(`  • ${d.from} → ${d.to}: *${r(d.paise)}*`))
  L.push('')
  L.push('*Member-wise:*')
  opts.perMember.forEach((m) => {
    const tag = m.net > 0 ? `(receives ${r(m.net)})` : m.net < 0 ? `(pays ${r(-m.net)})` : '(settled)'
    L.push(`  • ${m.name}: paid ${r(m.paid)}, share ${r(m.owed)} ${tag}`)
  })
  if (opts.topCategories.length) {
    L.push('')
    L.push('*Top categories:*')
    opts.topCategories.forEach((c) => L.push(`  ${c.icon} ${c.label}: ${r(c.paise)}`))
  }
  L.push('')
  L.push('— Sent from RoomHisaab')
  return L.join('\n')
}

/** browser me file download (CSV / TXT / JSON) */
export function download(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
