import type { ReactNode } from 'react'

/** warm + actionable empty state — kabhi blank screen nahi (PDF rule) */
export function EmptyState({ emoji, title, body, action }: {
  emoji: string; title: string; body?: string; action?: ReactNode
}) {
  return (
    <div className="card p-8 text-center">
      <div className="glow-teal rounded-2xl py-4">
        <div className="text-5xl leading-none mb-3" aria-hidden="true">{emoji}</div>
        <h3 className="text-lg mb-1">{title}</h3>
        {body && <p className="text-ink-soft text-[14.5px] max-w-sm mx-auto">{body}</p>}
      </div>
      {action && <div className="mt-5 flex flex-wrap gap-2 justify-center">{action}</div>}
    </div>
  )
}
