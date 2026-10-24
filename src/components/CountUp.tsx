import { useEffect, useRef, useState } from 'react'
import { formatINR } from '../lib/money'
import { useReducedMotionPref } from '../hooks/useReducedMotion'

/** balance change pe 600ms count-up. Layout jump bilkul nahi (tabular-nums + fixed min-width) */
export function CountUp({ value, className, duration = 600 }: { value: number; className?: string; duration?: number }) {
  const reduced = useReducedMotionPref()
  const [display, setDisplay] = useState(value)
  const from = useRef(value)
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (reduced) { setDisplay(value); from.current = value; return }
    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)          // easeOutCubic
      setDisplay(Math.round(a + (b - a) * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else from.current = b
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current); from.current = b }
  }, [value, duration, reduced])

  return <span className={`num ${className ?? ''}`}>{formatINR(display)}</span>
}
