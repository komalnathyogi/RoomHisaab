/** Shimmer placeholders — spinner ZERO (PDF rule) */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function ExpenseCardSkeleton() {
  return (
    <div className="card p-4 flex items-center gap-3">
      <Skeleton className="h-11 w-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-5 w-20" />
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-28 w-full rounded-xl2" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-xl2" /><Skeleton className="h-20 rounded-xl2" />
      </div>
      <Skeleton className="h-5 w-40" />
      <ExpenseCardSkeleton /><ExpenseCardSkeleton /><ExpenseCardSkeleton />
    </div>
  )
}
