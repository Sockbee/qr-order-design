/**
 * localStorage access, keyed by session token (UX-STRUCTURE §5.1, §6.2).
 *
 * Every call is guarded: Safari private mode throws on both read and write,
 * and a full quota throws on write. Losing persistence must never break the
 * ordering flow, so failures degrade to in-memory state.
 */

const PREFIX = 'qr-order'

export function sessionScopedKey(token: string, name: string): string {
  return `${PREFIX}:${token}:${name}`
}

/** The last session the device joined, so `/` can resume it. */
export const LAST_TOKEN_KEY = `${PREFIX}:last-token`

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable or full — the session continues in memory.
  }
}

export function readStoredString(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStoredString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // See writeStored.
  }
}
