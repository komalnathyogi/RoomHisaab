import { useEffect, useRef } from 'react'
import { useReducedMotionPref } from '../hooks/useReducedMotion'

/** Canvas confetti — sirf jab room poori tarah settle ho. 1.2s, low particles. */
export function Confetti({ fire, onDone }: { fire: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotionPref()

  useEffect(() => {
    if (!fire) return
    if (reduced) { onDone?.(); return }
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = (canvas.width = window.innerWidth * dpr)
    const h = (canvas.height = window.innerHeight * dpr)
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`

    const COLORS = ['#4F46C8', '#179A6B', '#D99A16', '#D9534F', '#3E7CB1', '#248A7A']
    const N = 70
    const parts = Array.from({ length: N }, () => ({
      x: w * (0.25 + Math.random() * 0.5),
      y: h * 0.28 + Math.random() * h * 0.08,
      vx: (Math.random() - 0.5) * 9 * dpr,
      vy: (-Math.random() * 11 - 4) * dpr,
      size: (5 + Math.random() * 7) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.28,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    }))

    const g = 0.42 * dpr
    const started = performance.now()
    let raf = 0
    const draw = (now: number) => {
      const elapsed = now - started
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.vy += g; p.x += p.vx; p.y += p.vy; p.rot += p.vr
        p.vx *= 0.99
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 1400)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62)
        ctx.restore()
      }
      if (elapsed < 1400) raf = requestAnimationFrame(draw)
      else { ctx.clearRect(0, 0, w, h); onDone?.() }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [fire, reduced, onDone])

  if (!fire) return null
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden="true" />
}
