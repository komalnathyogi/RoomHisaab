import { useCallback, useEffect, useState } from 'react'

const KEY = 'roomhisaab.ui.advancedMode'
const EVENT = 'roomhisaab:advanced-mode'

export function useAdvancedMode() {
  const [advanced, setAdvanced] = useState(() => {
    try { return localStorage.getItem(KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    const refresh = () => {
      try { setAdvanced(localStorage.getItem(KEY) === 'true') } catch { setAdvanced(false) }
    }
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [])

  const set = useCallback((value: boolean) => {
    setAdvanced(value)
    try { localStorage.setItem(KEY, String(value)) } catch { /* preference remains in memory */ }
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [advanced, set] as const
}
