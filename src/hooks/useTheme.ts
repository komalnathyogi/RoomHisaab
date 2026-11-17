import { useCallback, useEffect } from 'react'
import { useStore } from './useStore'

/** dark mode — system preference default, choice persisted */
export function useTheme() {
  const { state, updateProfile } = useStore()
  const theme = state.profile.theme

  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      root.classList.toggle('dark', dark)
      root.classList.toggle('light', !dark)
      root.style.colorScheme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const cycle = useCallback(() => {
    updateProfile({ theme: theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light' })
  }, [theme, updateProfile])

  return { theme, setTheme: (t: 'light' | 'dark' | 'system') => updateProfile({ theme: t }), cycle }
}
