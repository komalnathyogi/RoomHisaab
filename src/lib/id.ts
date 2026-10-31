/** chhota, fast, unique-enough ID (crypto.randomUUID fallback ke saath) */
export function uid(prefix = ''): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return prefix + c.randomUUID().slice(0, 8)
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** 6-char invite code — confusing chars (0/O, 1/I) hata diye */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function roomCode(len = 6): string {
  let s = ''
  const arr = new Uint32Array(len)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(arr)
  for (let i = 0; i < len; i++) s += ALPHABET[(arr[i] || Math.floor(Math.random() * 1e9)) % ALPHABET.length]
  return s
}
