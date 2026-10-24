import type { Member, UpiApp } from '../lib/types'
import { UPI_APPS, isValidVpa } from '../lib/upi'
import { paiseToInputValue, parseRupeesToPaise } from '../lib/money'
import { Icon } from './Icon'
import clsx from 'clsx'

export interface MemberProfileDraft {
  fullName: string
  upiId: string
  phone: string
  email: string
  preferredUpiApp: UpiApp
  defaultSharePercent: string
  monthlyBudget: string
  city: string
  notes: string
}

export const emptyMemberProfile = (): MemberProfileDraft => ({
  fullName: '',
  upiId: '',
  phone: '',
  email: '',
  preferredUpiApp: 'any',
  defaultSharePercent: '',
  monthlyBudget: '',
  city: '',
  notes: '',
})

export function memberToProfileDraft(m?: Partial<Member> | null): MemberProfileDraft {
  return {
    fullName: m?.fullName ?? '',
    upiId: m?.upiId ?? '',
    phone: m?.phone ?? '',
    email: m?.email ?? '',
    preferredUpiApp: m?.preferredUpiApp ?? 'any',
    defaultSharePercent: m?.defaultSharePercent != null ? String(m.defaultSharePercent) : '',
    monthlyBudget: m?.monthlyBudgetPaise != null ? paiseToInputValue(m.monthlyBudgetPaise) : '',
    city: m?.city ?? '',
    notes: m?.notes ?? '',
  }
}

export function profileDraftError(d: MemberProfileDraft): string | null {
  if (d.upiId.trim() && !isValidVpa(d.upiId.trim())) return 'Enter a valid UPI ID, such as name@okhdfcbank.'
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) return 'Enter a valid email address.'
  const digits = d.phone.replace(/\D/g, '')
  if (d.phone.trim() && (digits.length < 10 || digits.length > 15)) return 'Enter a valid phone number.'
  if (d.defaultSharePercent.trim()) {
    const n = Number(d.defaultSharePercent)
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Default share must be between 0% and 100%.'
  }
  if (d.monthlyBudget.trim() && parseRupeesToPaise(d.monthlyBudget) === null) return 'Enter a valid monthly budget amount.'
  return null
}

export function profileDraftToMember(d: MemberProfileDraft): Partial<Member> {
  const share = d.defaultSharePercent.trim() ? Number(d.defaultSharePercent) : undefined
  const budget = d.monthlyBudget.trim() ? parseRupeesToPaise(d.monthlyBudget) ?? undefined : undefined
  return {
    fullName: d.fullName.trim() || undefined,
    upiId: d.upiId.trim().toLowerCase() || undefined,
    phone: d.phone.trim() || undefined,
    email: d.email.trim().toLowerCase() || undefined,
    preferredUpiApp: d.preferredUpiApp,
    defaultSharePercent: Number.isFinite(share) ? share : undefined,
    monthlyBudgetPaise: budget,
    city: d.city.trim() || undefined,
    notes: d.notes.trim() || undefined,
  }
}

export function profileCompletion(m: Partial<Member>): number {
  const checks = [
    !!m.fullName,
    !!m.upiId,
    !!m.phone,
    !!m.email,
    !!m.preferredUpiApp && m.preferredUpiApp !== 'any',
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function missingProfileFields(m: Partial<Member>): string[] {
  const missing: string[] = []
  if (!m.fullName) missing.push('Full name')
  if (!m.upiId) missing.push('UPI ID')
  if (!m.phone) missing.push('WhatsApp number')
  if (!m.email) missing.push('Email')
  if (!m.preferredUpiApp || m.preferredUpiApp === 'any') missing.push('Preferred UPI app')
  return missing
}

export function MemberProfileFields({
  value,
  onChange,
  idPrefix,
  compact = false,
}: {
  value: MemberProfileDraft
  onChange: (next: MemberProfileDraft) => void
  idPrefix: string
  compact?: boolean
}) {
  const set = <K extends keyof MemberProfileDraft>(key: K, next: MemberProfileDraft[K]) => onChange({ ...value, [key]: next })
  const vpaInvalid = value.upiId.trim() !== '' && !isValidVpa(value.upiId.trim())

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 flex gap-3">
        <span className="icon-tile h-10 w-10"><Icon name="shield" size={20} /></span>
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          <b className="text-ink">These details tell RoomHisaab where this person receives UPI money.</b> A UPI ID is not a PIN. Never enter a UPI PIN, OTP, card number, or bank password.
                  </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3.5">
        <div>
          <label className="label" htmlFor={`${idPrefix}-full`}>Full name (name payer should see)</label>
          <input id={`${idPrefix}-full`} className="input" placeholder="Komal" value={value.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-upi`}>Receiving UPI ID <span className="normal-case tracking-normal text-primary">(needed for QR)</span></label>
          <input id={`${idPrefix}-upi`} className={clsx('input', vpaInvalid && '!border-overdue')} placeholder="name@okhdfcbank" value={value.upiId}
            onChange={(e) => set('upiId', e.target.value.replace(/\s/g, '').toLowerCase())} autoCapitalize="none" autoComplete="off" aria-invalid={vpaInvalid} />
          <p className={clsx('text-[11.5px] mt-1.5', vpaInvalid ? 'text-overdue font-semibold' : 'text-ink-soft')}>
            {vpaInvalid ? 'Use the format name@bank.' : 'Other members use this address to pay this person. Find it inside the person’s UPI app profile.'}
          </p>
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-phone`}>WhatsApp number (for reminders)</label>
          <input id={`${idPrefix}-phone`} className="input" placeholder="+91 98765 43210" value={value.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-email`}>Email (optional)</label>
          <input id={`${idPrefix}-email`} className="input" placeholder="name@example.com" value={value.email} onChange={(e) => set('email', e.target.value.trim().toLowerCase())} inputMode="email" autoComplete="email" />
        </div>
      </div>

      <div>
        <span className="label">Preferred UPI app (app to open first)</span>
        <div className="flex flex-wrap gap-2">
          {UPI_APPS.map((app) => (
            <button key={app.id} type="button" onClick={() => set('preferredUpiApp', app.id)} className={value.preferredUpiApp === app.id ? 'chip-on' : 'chip-off'} aria-pressed={value.preferredUpiApp === app.id} title={app.hint}>
              {app.label}
            </button>
          ))}
        </div>
      </div>

      {!compact && (
        <details className="rounded-2xl border border-line-light bg-surface-alt px-4 py-3.5" open={!!(value.defaultSharePercent || value.monthlyBudget || value.city || value.notes)}>
          <summary className="cursor-pointer font-display font-bold text-[14px] flex items-center gap-2">
            <Icon name="settings" size={17} className="text-primary" /> Optional: fixed share, budget, city, and note
          </summary>
          <div className="grid sm:grid-cols-3 gap-3.5 mt-4">
            <div>
              <label className="label" htmlFor={`${idPrefix}-share`}>Usual share % (blank = equal)</label>
              <input id={`${idPrefix}-share`} className="input" placeholder="Auto equal" inputMode="decimal" value={value.defaultSharePercent}
                onChange={(e) => set('defaultSharePercent', e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div>
              <label className="label" htmlFor={`${idPrefix}-budget`}>Monthly budget ₹</label>
              <input id={`${idPrefix}-budget`} className="input" placeholder="15000" inputMode="decimal" value={value.monthlyBudget}
                onChange={(e) => set('monthlyBudget', e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div>
              <label className="label" htmlFor={`${idPrefix}-city`}>City</label>
              <input id={`${idPrefix}-city`} className="input" placeholder="Pune" value={value.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" />
            </div>
          </div>
          <div className="mt-3.5">
            <label className="label" htmlFor={`${idPrefix}-notes`}>Private room note</label>
            <textarea id={`${idPrefix}-notes`} className="input resize-y" rows={2} maxLength={240} placeholder="Example: stays here only on weekends" value={value.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </details>
      )}
    </div>
  )
}
