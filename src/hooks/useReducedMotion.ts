import { useStore } from './useStore'
/** user ne reduce-motion on kiya ho ya OS ne — dono maano (WCAG) */
export function useReducedMotionPref(): boolean {
  const { state } = useStore()
  if (state.profile.reduceMotion) return true
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
