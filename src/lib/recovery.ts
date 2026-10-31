const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const RECOVERY_BODY_LENGTH = 24

export function normalizeRecoveryKey(value: string): string {
  let clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.startsWith('RH') && clean.length === RECOVERY_BODY_LENGTH + 2) {
    clean = clean.slice(2)
  }
  return clean
}

export function isValidRecoveryKey(value: string): boolean {
  const clean = normalizeRecoveryKey(value)
  return clean.length === RECOVERY_BODY_LENGTH && [...clean].every((ch) => RECOVERY_ALPHABET.includes(ch))
}

export function generateRecoveryKey(): string {
  const bytes = new Uint8Array(RECOVERY_BODY_LENGTH)
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random generation is not available in this browser.')
  }
  globalThis.crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join('')
  const groups = body.match(/.{1,4}/g) ?? [body]
  return `RH-${groups.join('-')}`
}

export function recoveryKeyHint(value: string): string {
  return normalizeRecoveryKey(value).slice(-4)
}

export async function hashRecoveryKey(value: string): Promise<string> {
  const clean = normalizeRecoveryKey(value)
  if (!isValidRecoveryKey(clean)) throw new Error('Enter the complete recovery key.')
  if (!globalThis.crypto?.subtle) {
    throw new Error('Recovery requires a secure browser context. Use the HTTPS website or localhost.')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
