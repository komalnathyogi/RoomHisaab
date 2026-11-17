import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const PREFIX = 'roomhisaab.draft.'

export function draftKey(name: string): string {
  return `${PREFIX}${name}`
}

export function loadDraft<T>(name: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(draftKey(name))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { value?: T } | T
    if (parsed && typeof parsed === 'object' && 'value' in parsed) {
      return (parsed as { value: T }).value
    }
    return parsed as T
  } catch {
    return fallback
  }
}

export function saveDraft<T>(name: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(draftKey(name), JSON.stringify({ value, savedAt: Date.now() }))
  } catch {
    // Storage may be full (for example, a large bill photo). The form must
    // continue working even if one draft cannot be stored.
  }
}

export function clearDraft(name: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(draftKey(name))
  } catch {
    // ignore
  }
}

/**
 * Form state that survives page navigation, refresh and browser restart.
 * Passwords and other secrets must not use this hook.
 */
export function usePersistentState<T>(
  name: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
    return loadDraft(name, fallback)
  })
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(value)
  const cleared = useRef(false)
  latest.current = value

  const setPersistentValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    cleared.current = false
    setValue(next)
  }, [])

  useEffect(() => {
    if (cleared.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (!cleared.current) saveDraft(name, latest.current)
    }, 180)
    return () => window.clearTimeout(timer.current)
  }, [name, value])

  useEffect(() => {
    const flush = () => { if (!cleared.current) saveDraft(name, latest.current) }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      flush()
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [name])

  const clear = useCallback(() => {
    cleared.current = true
    window.clearTimeout(timer.current)
    clearDraft(name)
  }, [name])

  return [value, setPersistentValue, clear]
}
