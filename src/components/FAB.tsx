import { motion } from 'framer-motion'

/** Floating "+ Add" — mobile pe bottom-nav ke upar, desktop pe bottom-right */
export function FAB({ onClick, label = 'Add' }: { onClick: () => void; label?: string }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed z-50 right-4 bottom-[86px] md:bottom-8 md:right-8 h-14 min-h-[56px] pl-5 pr-6 rounded-full bg-primary-solid text-primary-on
                 font-display font-bold shadow-fab flex items-center gap-2 hover:bg-primary-solidhover active:scale-95 transition-colors"
      aria-label={`${label} expense`}
    >
      <span className="text-2xl leading-none -mt-0.5" aria-hidden="true">+</span>
      <span className="text-[15.5px]">{label}</span>
    </motion.button>
  )
}
