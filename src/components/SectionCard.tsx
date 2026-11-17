import type { ReactNode } from 'react'

export function SectionCard({ title, sub, right, children, className = '' }: {
  title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`card hover-lift p-4 md:p-5 ${className}`}>
      <header className="mb-3.5 flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="text-[16.5px]">{title}</h2>
          {sub && <p className="text-[12.5px] text-ink-soft mt-0.5">{sub}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </header>
      {children}
    </section>
  )
}
