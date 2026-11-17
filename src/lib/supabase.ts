// ─────────────────────────────────────────────────────────────
// SUPABASE CLIENT
// Sirf publishable/anon key browser me jaati hai. Secret/service-role
// key frontend me kabhi nahi rakhni — saari asliyat RLS + RPCs me hai.
// ─────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AUTH_STORAGE_KEY, roomHisaabAuthStorage } from './authPersistence'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const rawKey = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim()

function normalizeSupabaseUrl(raw?: string): string {
  if (!raw) return ''
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '')
  try {
    const url = new URL(cleaned)
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function normalizeSupabaseKey(raw?: string): string {
  if (!raw) return ''
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '')
  // Sirf browser-safe keys allow karo:
  // 1) nayi Publishable key: sb_publishable_...
  // 2) purani Anon key: JWT jaisi teen-part token
  // URL, command, secret/service-role key ya random text reject ho jaayega.
  if (cleaned.startsWith('sb_publishable_') && /^\S{20,}$/.test(cleaned)) return cleaned
  if (cleaned.length >= 80 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cleaned)) return cleaned
  return ''
}

const normalUrl = normalizeSupabaseUrl(rawUrl)
const normalKey = normalizeSupabaseKey(rawKey)
const swappedUrl = normalizeSupabaseUrl(rawKey)
const swappedKey = normalizeSupabaseKey(rawUrl)

// Common deployment galti: URL wali jagah key aur key wali jagah URL paste ho
// jaata hai. Dono values clearly ulta hon to app safely auto-swap kar legi,
// taaki sirf is chhoti galti se poori website white screen na ho.
export const cloudEnvSwapped = !(normalUrl && normalKey) && Boolean(swappedUrl && swappedKey)
if (cloudEnvSwapped) {
  console.warn('[RoomHisaab] Supabase URL and key were swapped in the environment. The app corrected them automatically; please also fix the deployment settings.')
}

export const SUPABASE_URL = normalUrl || (cloudEnvSwapped ? swappedUrl : '')
const publishableKey = normalKey || (cloudEnvSwapped ? swappedKey : '')
const hasValidCloudEnv = Boolean(SUPABASE_URL && publishableKey)
export const cloudConfigError = !hasValidCloudEnv && (rawUrl || rawKey)
  ? 'Supabase environment values are invalid. Use only the https://...supabase.co URL for VITE_SUPABASE_URL and the publishable or anon key for VITE_SUPABASE_PUBLISHABLE_KEY.'
  : null

function createSupabaseClient(): SupabaseClient | null {
  if (!hasValidCloudEnv) return null
  try {
    return createClient(SUPABASE_URL, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: roomHisaabAuthStorage,
        storageKey: AUTH_STORAGE_KEY,
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  } catch (error) {
    // Env galat ho to white screen crash ki jagah app local mode me khule.
    console.error('[RoomHisaab] Supabase client could not start; check the environment values', error)
    return null
  }
}

export const supabase: SupabaseClient | null = createSupabaseClient()
export const isCloudConfigured = Boolean(supabase)

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(cloudConfigError ?? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  }
  return supabase
}

/** "Shanti Niwas 204!!" → "shanti-niwas-204" */
export function normalizeRoomLoginId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48)
}

/** Member username ko Supabase-safe banao: "Amit" → "amitkumar" */
export function normalizeLoginUsername(value: string): string {
  const clean = value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 40)
  return clean.length >= 2 ? clean : ''
}

/**
 * Har room-member ka personal Supabase identity synthetic email se banta hai.
 * User ko email yaad nahi rakhna: Room Login ID + username se yahi email
 * dobara ban jaata hai. Personal password Supabase Auth securely hash karta hai.
 */
export function memberAuthEmail(roomLoginId: string, username: string): string {
  const room = normalizeRoomLoginId(roomLoginId)
  const user = normalizeLoginUsername(username)
  return `${user}.${room}@members.roomhisaab.invalid`
}

export function makeRoomLoginId(roomName: string): string {
  const base = normalizeRoomLoginId(roomName).slice(0, 34) || 'room'
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base}-${suffix}`.slice(0, 48)
}

export function cloudErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const clean = raw.trim()

  if (/invalid login credentials/i.test(clean)) return 'Room Login ID, username or personal password is incorrect.'
  if (/user already registered|already exists/i.test(clean)) return 'This username already exists for the room. Use the Login page or choose a new recovery username.'
  if (/password should be at least/i.test(clean)) return 'Personal password must contain at least 8 characters.'
  if (/failed to fetch|network|timeout|timed out/i.test(clean)) return 'Could not connect to Supabase. Check your connection and try again.'
  if (/jwt expired|invalid jwt|session.*expired|refresh token/i.test(clean)) return 'Your saved session has expired. Sign in again.'
  if (/rate limit|too many requests/i.test(clean)) return 'Too many attempts. Wait a moment and try again.'
  if (/row-level security|permission denied|not authorized/i.test(clean)) return 'Server permission denied. You can change only your own expenses and profile.'
  if (/duplicate key|unique constraint|already.*use|pehle se/i.test(clean)) return 'That room, username, or member name is already in use. Choose a different one.'
  if (/foreign key/i.test(clean)) return 'The linked room or member record could not be found. Refresh and try again.'
  if (/invalid api key|api key.*invalid/i.test(clean)) return 'The Supabase publishable key in this deployment is invalid.'

  // Translate legacy RPC messages at the client boundary so users only see
  // professional English even if an older database function is still deployed.
  if (/Room Login ID format/i.test(clean)) return 'The Room Login ID format is invalid.'
  if (/Login username format|username format/i.test(clean)) return 'The login username format is invalid.'
  if (/Room nahi mila|Room not found/i.test(clean)) return 'The room was not found.'
  if (/Invite.*(galat|sahi nahi|band)|invite.*(invalid|expired|disabled)/i.test(clean)) return 'This invite link is invalid, expired, or disabled.'
  if (/selected member.*(claimed|available)|member.*pehle hi claimed/i.test(clean)) return 'This member is already claimed. Sign in from the Login page.'
  if (/Room Password galat|Current Room Password galat/i.test(clean)) return 'The Room Password is incorrect.'
  if (/Selected member nahi mila|Member.*nahi mila|Membership nahi mili|Apni membership/i.test(clean)) return 'The selected member membership was not found.'
  if (/Khud ka login reset/i.test(clean)) return 'You cannot reset your own login. Ask another room admin to do it.'
  if (/Split ka total|split total/i.test(clean)) return 'The split total must equal the expense amount.'
  if (/Dusre member ka kharcha/i.test(clean)) return 'You cannot edit another member’s expense.'
  if (/Expense save nahi hua/i.test(clean)) return 'The expense could not be saved. Check your permission and try again.'
  if (/Migration me 1 se 8/i.test(clean)) return 'Migration must contain between 1 and 8 members.'
  if (/exactly ek current member/i.test(clean)) return 'Select exactly one current member for migration.'
  if (/Virtual member.*login/i.test(clean)) return 'A login cannot be created for a virtual member.'
  if (/migration details|Ek local|Ek kharche|Ek settlement|Ek recurring/i.test(clean)) return 'One item in the local room data is invalid and could not be migrated.'
  if (/pehle hi cloud me migrate/i.test(clean)) return 'This room has already been migrated to the cloud. Use Login or Join to open it.'
  if (/Migration save nahi hua/i.test(clean)) return 'The migration could not be saved. Your local room is unchanged.'
  if (/Local room identity/i.test(clean)) return 'The local room identity could not be found.'
  if (/Login required hai/i.test(clean)) return 'Sign in first.'
  if (/(Room|Member|Nickname).*sahi.*(naam|likho)|Apna nickname likho/i.test(clean)) return 'Enter a valid name.'
  if (/Room Login ID me sirf/i.test(clean)) return 'Use only lowercase letters, numbers, and hyphens in the Room Login ID.'
  if (/(Room Password|Naya Room Password).*8 se 72/i.test(clean)) return 'The Room Password must contain between 8 and 72 characters.'
  if (/max 8 members|Room full hai/i.test(clean)) return 'This room already has the maximum of 8 members.'
  if (/sirf.*admin\/owner|admin\/owner.*sakta/i.test(clean)) return 'Only a room owner or admin can perform this action.'
  if (/Invite link expire\/lock/i.test(clean)) return 'This invite link has expired or is locked. Ask an admin for a new link.'
  if (/Pehle apna member login banao/i.test(clean)) return 'Create your member login first.'
  if (/invite kisi specific member/i.test(clean)) return 'This invite is reserved for a specific member.'
  if (/Claimed member ki profile sirf/i.test(clean)) return 'Only that member can change their claimed profile.'
  if (/Expense data incomplete/i.test(clean)) return 'The expense data is incomplete.'
  if (/Splits missing/i.test(clean)) return 'Expense splits are missing.'
  if (/Split me room ke bahar/i.test(clean)) return 'A split contains a person who is not a member of this room.'
  if (/Expense ID dusre room/i.test(clean)) return 'This expense ID already belongs to another room.'
  if (/Ek baar me max .* migrate/i.test(clean)) return 'This local room contains too many records for one migration batch.'
  if (/Member IDs ya nickname duplicate/i.test(clean)) return 'The migration contains duplicate member IDs or names.'

  const looksLikeLegacyHinglish = /\b(nahi|galat|pehle|chahiye|kharcha|kharche|dusre|khud|karao|rakho|jao|mila|mili|barabar|hai|hain|likho|sakta|sakte|maango|banao|kisi|sirf|apna|apni|naya|naam|bahar|hua|badal|chhoti)\b|band kar|sahi hai|ho raha|ho chuka|ke liye/i.test(clean)
  if (looksLikeLegacyHinglish) return 'The cloud request could not be completed. Check the details and try again.'

  return clean || 'Something went wrong with the cloud service. Please try again.'
}
