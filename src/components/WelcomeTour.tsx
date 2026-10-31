import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon, type IconName } from './Icon'
import clsx from 'clsx'

const TOUR_KEY = 'roomhisaab.welcomeTour.dismissed.global.v1'
const LEGACY_TOUR_PREFIX = 'roomhisaab.welcomeTour.seen.v1.'

export function hasSeenWelcomeTour(_roomId?: string | null): boolean {
  try {
    if (window.localStorage.getItem(TOUR_KEY) === '1') return true
    const hadDismissedRoomTour = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .some((key) => key?.startsWith(LEGACY_TOUR_PREFIX) && window.localStorage.getItem(key) === '1')
    if (hadDismissedRoomTour) {
      window.localStorage.setItem(TOUR_KEY, '1')
      return true
    }
    return false
  } catch {
    return true
  }
}

export function markWelcomeTourSeen(_roomId?: string | null) {
  try {
    window.localStorage.setItem(TOUR_KEY, '1')
  } catch {
    // The tour can still be closed for this visit.
  }
}

interface TourStep {
  icon: IconName
  title: string
  body: string
  example: string
  actionLabel?: string
  actionTo?: string
}

const STEPS: TourStep[] = [
  {
    icon: 'home',
    title: 'Think of RoomHisaab as one shared notebook',
    body: 'Roommates write shared expenses in one place. The app remembers every entry and does the maths for everyone.',
    example: 'Komal Nath pays ₹900 for groceries for 3 people. RoomHisaab remembers that Komal Nath paid it.',
  },
  {
    icon: 'scan',
    title: 'When someone pays, write it once',
    body: 'Use Add Expense for regular bills. Choose who shares it, then check each person’s share. Use Import Expenses to fill details from a message, file, or voice.',
    example: 'Add groceries for everyone, or share an electricity bill with selected members.',
    actionLabel: 'Try Add Expense',
    actionTo: '/room/buy',
  },
  {
    icon: 'chart',
    title: 'The app divides the bill for you',
    body: 'You do not need a calculator. RoomHisaab combines every expense and shows the final balance for each person.',
    example: '₹900 ÷ 3 = ₹300 each. A positive balance means you will receive money. A negative balance means you need to pay. Zero means no payment is due.',
    actionLabel: 'See Home',
    actionTo: '/room',
  },
  {
    icon: 'qr',
    title: 'Pay pending money from Settle Up',
    body: 'Settle Up creates an exact QR or opens your UPI app. RoomHisaab never takes money by itself and never asks for your UPI PIN.',
    example: 'Always check the receiver name and amount inside GPay, PhonePe, Paytm, or BHIM before approving.',
    actionLabel: 'Open Settle Up',
    actionTo: '/room/payments',
  },
  {
    icon: 'help',
    title: 'Stuck? Need help? Search here',
    body: 'Help lets you search in normal words such as “invite”, “old bill”, “monthly rent”, or “forgot password”, then takes you to the correct page.',
    example: 'You can reopen this tour and every page tip from Help at any time.',
    actionLabel: 'Open Help',
    actionTo: '/room/guide',
  },
]

export function WelcomeTour({ open, roomId, personal = false, onClose }: { open: boolean; roomId?: string | null; personal?: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const steps = personal ? STEPS.filter((tourStep) => tourStep.actionTo !== '/room/payments') : STEPS
  const current = steps[step]
  const isLast = step === steps.length - 1

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    setStep(0)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 80)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        markWelcomeTourSeen(roomId)
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, roomId])

  const closeAndRemember = () => {
    markWelcomeTourSeen(roomId)
    onClose()
  }

  const openAction = () => {
    if (!current.actionTo) return
    markWelcomeTourSeen(roomId)
    onClose()
    navigate(current.actionTo)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[240] flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
        >
          <div className="absolute inset-0 bg-ink/60 sm:backdrop-blur-[3px]" onClick={closeAndRemember} aria-hidden="true" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-tour-title"
            aria-describedby="welcome-tour-body"
            className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-line-light bg-surface-card p-4 shadow-lift3d sm:p-7"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            data-testid="welcome-tour"
          >
            <div className="flex items-start gap-3">
              <span className="icon-tile h-12 w-12 shrink-0"><Icon name={current.icon} size={24} /></span>
              <div className="min-w-0 flex-1">
                <p className="kicker">1-minute tour · Step {step + 1} of {steps.length}</p>
                <h2 id="welcome-tour-title" className="mt-1 text-[21px] leading-tight sm:text-[27px]">{current.title}</h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeAndRemember}
                className="btn-ghost shrink-0 !px-2.5"
                aria-label="Close welcome tour"
              >
                <Icon name="x" size={19} />
              </button>
            </div>

            <div
              className="mt-4 flex gap-1.5"
              role="progressbar"
              aria-label="Tour progress"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={step + 1}
              aria-valuetext={`Step ${step + 1} of ${steps.length}: ${current.title}`}
            >
              {steps.map((item, index) => (
                <span
                  key={item.title}
                  className={clsx('h-2 flex-1 rounded-full transition-colors', index <= step ? 'bg-gradient-to-r from-primary-solid to-accent' : 'bg-ink/10')}
                  aria-hidden="true"
                />
              ))}
            </div>

            <p id="welcome-tour-body" className="mt-4 text-[14.5px] leading-relaxed text-ink-soft sm:text-[15px]">{current.body}</p>

            <div className="mt-3.5 rounded-2xl border border-primary/20 bg-primary/10 p-3.5 sm:p-4">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-primary">
                <Icon name="sparkles" size={16} /> Easy example
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{current.example}</p>
            </div>

            {current.actionLabel && current.actionTo && (
              <button type="button" onClick={openAction} className="btn-outline mt-4 w-full !py-3 sm:w-auto">
                <Icon name="arrowRight" size={18} /> {current.actionLabel}
              </button>
            )}

            <div className="sticky bottom-0 mt-5 flex flex-wrap items-center gap-2 border-t border-line-light bg-surface-card/95 py-3 backdrop-blur-sm">
              <button type="button" onClick={closeAndRemember} className="btn-ghost !px-3">
                Skip tour
              </button>
              <span className="flex-1" />
              {step > 0 && (
                <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="btn-outline !px-4">
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => isLast ? closeAndRemember() : setStep((value) => Math.min(steps.length - 1, value + 1))}
                className="btn-primary !px-5"
              >
                {isLast ? 'Finish' : 'Next'} <Icon name={isLast ? 'check' : 'arrowRight'} size={18} />
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
