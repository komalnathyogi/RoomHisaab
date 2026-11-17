import { initials } from '../lib/constants'
import clsx from 'clsx'

export function Avatar({ name, color, size = 40, className, ring }: {
  name: string; color: string; size?: number; className?: string; ring?: boolean
}) {
  return (
    <span
      className={clsx('inline-flex items-center justify-center rounded-full font-display font-bold text-white select-none shrink-0', ring && 'ring-2 ring-white dark:ring-surface-darkcard', className)}
      style={{ width: size, height: size, background: color, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ items, size = 28 }: { items: { name: string; color: string }[]; size?: number }) {
  return (
    <span className="inline-flex -space-x-2">
      {items.slice(0, 5).map((m, i) => (
        <Avatar key={i} name={m.name} color={m.color} size={size} ring />
      ))}
      {items.length > 5 && (
        <span className="inline-flex items-center justify-center rounded-full bg-surface-card2 text-ink ring-2 ring-white dark:ring-surface-darkcard text-[11px] font-bold" style={{ width: size, height: size }}>
          +{items.length - 5}
        </span>
      )}
    </span>
  )
}
