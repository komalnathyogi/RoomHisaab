// ─────────────────────────────────────────────────────────────
// AUTH PERSISTENCE / REMEMBER THIS DEVICE
//
// Security rules:
// • Password kabhi cookie/localStorage me save nahi hota.
// • Cookie me sirf non-sensitive hints jaate hain: remember on/off,
//   last Room Login ID aur username (form fast prefill ke liye).
// • Supabase ki refresh-session entry browser storage adapter ke through
//   localStorage (remember ON) ya sessionStorage (remember OFF) me jaati hai.
// • Website ka main hisaab cookie me nahi rakha jaata — cookie ~4KB hoti hai
//   aur har request ke saath jaati hai. Fast snapshot ke liye existing
//   localStorage AppState cache hi sahi jagah hai; asli data Supabase me hai.
// ─────────────────────────────────────────────────────────────

export const AUTH_STORAGE_KEY = 'roomhisaab.supabase.auth'
export const CLOUD_META_STORAGE_KEY = 'roomhisaab.cloud.v1'

const REMEMBER_KEY = 'roomhisaab.auth.remember'
const LAST_LOGIN_KEY = 'roomhisaab.auth.lastLogin'

const COOKIE_REMEMBER = 'rh_remember'
const COOKIE_ROOM = 'rh_last_room'
const COOKIE_USER = 'rh_last_user'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180 // 180 din ki chhoti si hint cookie

export interface LastLoginHint {
  roomLoginId: string
  username: string
}

function browserStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function readCookie(name: string): string {
  try {
    const prefix = `${name}=`
    const part = document.cookie
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(prefix))
    return part ? decodeURIComponent(part.slice(prefix.length)) : ''
  } catch {
    return ''
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds = COOKIE_MAX_AGE_SECONDS): void {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
  } catch {
    /* cookies blocked ho to storage fallback chalega */
  }
}

function deleteCookie(name: string): void {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
  } catch {
    /* ignore */
  }
}

/**
 * Default true rakha hai taaki existing users ka session pehle jaisa hi
 * browser band karke kholne par bhi login rahe. Shared/public device par
 * user login page se checkbox hata sakta hai.
 */
export function getRememberDevicePreference(): boolean {
  const local = browserStorage('local')
  const saved = local?.getItem(REMEMBER_KEY)
  if (saved === '0') return false
  if (saved === '1') return true
  const cookie = readCookie(COOKIE_REMEMBER)
  if (cookie === '0') return false
  if (cookie === '1') return true
  return true
}

export function getPreferredAuthStorage(): Storage | null {
  return browserStorage(getRememberDevicePreference() ? 'local' : 'session')
}

function writeRememberCookies(remember: boolean, hint?: LastLoginHint): void {
  if (!remember) {
    deleteCookie(COOKIE_REMEMBER)
    deleteCookie(COOKIE_ROOM)
    deleteCookie(COOKIE_USER)
    return
  }
  writeCookie(COOKIE_REMEMBER, '1')
  if (hint?.roomLoginId) writeCookie(COOKIE_ROOM, hint.roomLoginId)
  if (hint?.username) writeCookie(COOKIE_USER, hint.username)
}

/**
 * Preference save karo aur jo Supabase auth entry already browser me hai,
 * use selected storage me move kar do. Yeh successful sign-in ke baad call
 * hota hai, taaki galat password wali koshish purana valid session na uda de.
 */
export function setRememberDevicePreference(remember: boolean): void {
  const local = browserStorage('local')
  const session = browserStorage('session')
  try { local?.setItem(REMEMBER_KEY, remember ? '1' : '0') } catch { /* private mode */ }
  if (remember) writeCookie(COOKIE_REMEMBER, '1')
  else writeRememberCookies(false)

  const selected = remember ? local : session
  const other = remember ? session : local
  const authValue = selected?.getItem(AUTH_STORAGE_KEY) ?? other?.getItem(AUTH_STORAGE_KEY)
  const metaValue = selected?.getItem(CLOUD_META_STORAGE_KEY) ?? other?.getItem(CLOUD_META_STORAGE_KEY)
  try {
    if (authValue && selected) selected.setItem(AUTH_STORAGE_KEY, authValue)
    if (metaValue && selected) selected.setItem(CLOUD_META_STORAGE_KEY, metaValue)
  } catch {
    /* storage full/blocked ho to in-memory session abhi chalega */
  }
  try { other?.removeItem(AUTH_STORAGE_KEY) } catch { /* ignore */ }
  try { other?.removeItem(CLOUD_META_STORAGE_KEY) } catch { /* ignore */ }
}

export function saveLastLoginHint(hint: LastLoginHint, remember = getRememberDevicePreference()): void {
  const clean: LastLoginHint = {
    roomLoginId: hint.roomLoginId.trim().toLowerCase(),
    username: hint.username.trim().toLowerCase(),
  }
  if (!clean.roomLoginId && !clean.username) return
  const target = browserStorage(remember ? 'local' : 'session')
  const other = browserStorage(remember ? 'session' : 'local')
  try { target?.setItem(LAST_LOGIN_KEY, JSON.stringify(clean)) } catch { /* ignore */ }
  try { other?.removeItem(LAST_LOGIN_KEY) } catch { /* ignore */ }
  writeRememberCookies(remember, clean)
}

export function loadLastLoginHint(): LastLoginHint {
  const preferred = getPreferredAuthStorage()
  try {
    const raw = preferred?.getItem(LAST_LOGIN_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LastLoginHint>
      return {
        roomLoginId: typeof parsed.roomLoginId === 'string' ? parsed.roomLoginId : '',
        username: typeof parsed.username === 'string' ? parsed.username : '',
      }
    }
  } catch {
    /* cookie fallback neeche */
  }
  return {
    roomLoginId: readCookie(COOKIE_ROOM),
    username: readCookie(COOKIE_USER),
  }
}

export function clearLastLoginHint(): void {
  try { browserStorage('local')?.removeItem(LAST_LOGIN_KEY) } catch { /* ignore */ }
  try { browserStorage('session')?.removeItem(LAST_LOGIN_KEY) } catch { /* ignore */ }
  deleteCookie(COOKIE_ROOM)
  deleteCookie(COOKIE_USER)
}

/**
 * Supabase JS storage adapter.
 * Remember ON  -> localStorage  (browser reopen ke baad bhi session)
 * Remember OFF -> sessionStorage (browser/session band = login khatm)
 * removeItem dono jagah saaf karta hai taaki purana token kahin bacha na rahe.
 */
export const roomHisaabAuthStorage = {
  getItem: (key: string): string | null => {
    const selected = getPreferredAuthStorage()
    try { return selected?.getItem(key) ?? null } catch { return null }
  },
  setItem: (key: string, value: string): void => {
    const remember = getRememberDevicePreference()
    const selected = browserStorage(remember ? 'local' : 'session')
    const other = browserStorage(remember ? 'session' : 'local')
    try { selected?.setItem(key, value) } catch { /* in-memory session still works */ }
    try { other?.removeItem(key) } catch { /* ignore */ }
  },
  removeItem: (key: string): void => {
    try { browserStorage('local')?.removeItem(key) } catch { /* ignore */ }
    try { browserStorage('session')?.removeItem(key) } catch { /* ignore */ }
  },
}
