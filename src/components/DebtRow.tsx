import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { Debt } from '../lib/balances'
import type { Member } from '../lib/types'
import { buildUpiLink, buildWhatsAppLink, settleReminderMessage } from '../lib/upi'
import { Avatar } from './Avatar'
import { CountUp } from './CountUp'
import { Icon } from './Icon'

/** Ek saaf line: "Amit → Komal ₹450" + 1 primary action (UPI) + Cash */
export function DebtRow({ debt, members, onSettle, onPay, index = 0 }: {
  debt: Debt; members: Member[]; onSettle: (d: Debt) => void; onPay?: (d: Debt) => void; index?: number
}) {
  const from = members.find((m) => m.id === debt.fromId)
  const to = members.find((m) => m.id === debt.toId)
  if (!from || !to) return null

  const upi = buildUpiLink({
    payeeVpa: to.upiId, payeeName: to.fullName || to.name, amountPaise: debt.paise,
    note: `RoomHisaab: ${from.name} → ${to.name}`, ref: `RH-${debt.fromId.slice(-4)}${debt.toId.slice(-4)}`,
  })
  const wa = buildWhatsAppLink(from.phone, settleReminderMessage(from.name, to.name, debt.paise, upi))

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.32), ease: [0.4, 0, 0.2, 1] }}
      className="card p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar name={from.name} color={from.color} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold leading-tight">
            {from.name} <span className="text-ink-soft font-normal">pays</span> {to.name} 
          </p>
          <p className="text-[12px] text-ink-soft mt-0.5 truncate">
            {upi ? `UPI ready · ${to.upiId}` : `${to.name} has no UPI ID`}
          </p>
        </div>
        <span className="hidden min-[430px]:block"><Avatar name={to.name} color={to.color} size={40} /></span>
        <CountUp value={debt.paise} className="text-[18px] sm:text-[20px] text-overdue whitespace-nowrap" />
      </div>

      <div className="flex gap-2 mt-3">
        {upi ? (
          onPay ? (
            <button onClick={() => onPay(debt)} className="btn-primary flex-1" title="Scan the QR or open a payment app">
              <Icon name="qr" size={19} /> QR / UPI Pay
            </button>
          ) : (
            <a href={upi} className="btn-primary flex-1" title="Open GPay, PhonePe or Paytm with the amount filled in">
              <Icon name="wallet" size={19} /> UPI Pay
            </a>
          )
        ) : (
          <Link to="/room/members" className="btn-primary flex-1" title="Add a UPI ID to enable one-tap payment">
            <Icon name="plus" size={18} /> Add UPI ID
          </Link>
        )}
        <button onClick={() => onSettle(debt)} className="btn-outline flex-1">
          Cash paid
        </button>
        {from.phone && (
          <a href={wa} target="_blank" rel="noreferrer" className="btn-ghost !px-3" title="Send a WhatsApp reminder with the UPI link" aria-label={`Send WhatsApp reminder to ${from.name}`}>
            <Icon name="phone" size={18} />
          </a>
        )}
      </div>
    </motion.li>
  )
}
