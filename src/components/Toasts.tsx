import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../hooks/useStore'
import clsx from 'clsx'

const TONE = {
  ok: 'border-moneyin/40 bg-moneyin/10',
  warn: 'border-pending/40 bg-pending/10',
  bad: 'border-overdue/40 bg-overdue/10',
}

/** slide-up + fade, 3.5-5s auto-dismiss, UNDO button ke saath */
export function Toasts() {
  const { toasts, dismissToast } = useStore()
  return (
    <div className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:bottom-6 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className={clsx(
              'pointer-events-auto w-full max-w-md rounded-2xl border px-4 py-3 shadow-cardHover backdrop-blur-xl',
              'bg-white/95 dark:bg-surface-darkcard/95',
              TONE[t.tone ?? 'ok'],
            )}
          >
            <div className="flex items-center gap-3">
              <p className="flex-1 text-[14px] font-medium text-ink">{t.message}</p>
              {t.actionLabel && (
                <button
                  onClick={() => { t.onAction?.(); dismissToast(t.id) }}
                  className="btn-primary !px-3 !py-1.5 !text-[13px] !min-h-[34px] shrink-0"
                >
                  {t.actionLabel}
                </button>
              )}
              <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink">✕</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
