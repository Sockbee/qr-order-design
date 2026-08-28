import { useCallback, useEffect, useState } from 'react'
import { ApiClientError } from '../api/client'
import { staffLogin } from '../api/staff/auth'
import {
  hasExpiredStaffSession,
  hasStaffApi,
  readStaffSession,
  writeStaffSession,
} from '../api/staff/client'
import type { StaffSession, StaffStation } from '../api/staff/client'

/**
 * How long the throttle lasts once five attempts fail inside ten minutes
 * (§4.9). The server owns the real clock; this only drives the countdown.
 */
const THROTTLE_MINUTES = 10

export interface StaffAuthError {
  /** Shown as the alert heading. */
  title: string
  detail: string
  tone: 'danger' | 'info'
  /** Set while the station is locked out — the submit button counts down. */
  throttledUntil: number | null
}

interface StaffAuthState {
  configured: boolean
  session: StaffSession | null
  /** A previous session ran out, rather than there never having been one. */
  expired: boolean
  submitting: boolean
  error: StaffAuthError | null
  login: (station: StaffStation, passcode: string) => Promise<boolean>
  logout: () => void
  clearError: () => void
}

function describe(error: unknown): StaffAuthError {
  const code = error instanceof ApiClientError ? error.code : 'NETWORK_ERROR'
  switch (code) {
    case 'STAFF_LOGIN_THROTTLED': {
      const retryAfter = readRetryAfter(error)
      return {
        title: '잠시 후 다시 시도해 주세요',
        detail: `10분 안에 5번 실패했습니다. ${THROTTLE_MINUTES}분 뒤에 다시 인증할 수 있습니다.`,
        tone: 'danger',
        throttledUntil: retryAfter ?? Date.now() + THROTTLE_MINUTES * 60_000,
      }
    }
    case 'INVALID_DEVICE_LABEL':
      return {
        title: '스테이션을 다시 골라 주세요',
        detail: '이 기기에 설정된 스테이션을 서버가 인식하지 못했습니다.',
        tone: 'danger',
        throttledUntil: null,
      }
    case 'API_NOT_CONFIGURED':
      return {
        title: '운영 API 주소가 설정되지 않았어요',
        detail: 'VITE_STAFF_APPS_SCRIPT_URL을 설정한 뒤 다시 열어 주세요.',
        tone: 'danger',
        throttledUntil: null,
      }
    case 'STAFF_PASSCODE_MISMATCH':
      return {
        title: 'passcode가 맞지 않아요',
        detail: '스테이션 선택은 그대로 두었습니다. passcode만 다시 입력하세요.',
        tone: 'danger',
        throttledUntil: null,
      }
    default:
      /*
       * This screen is never seen by a diner, but an error code still tells
       * an operator nothing actionable — say what to do instead (114:1838).
       */
      return {
        title: 'passcode가 맞지 않아요',
        detail: '스테이션 선택은 그대로 두었습니다. passcode만 다시 입력하세요.',
        tone: 'danger',
        throttledUntil: null,
      }
  }
}

function readRetryAfter(error: unknown): number | null {
  if (!(error instanceof ApiClientError) || !error.details ||
      typeof error.details !== 'object') return null
  const value = 'retryAfter' in error.details
    ? (error.details as { retryAfter?: unknown }).retryAfter
    : null
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now() ? timestamp : null
}

export function useStaffAuth(): StaffAuthState {
  const configured = hasStaffApi()
  const [session, setSession] = useState<StaffSession | null>(() =>
    readStaffSession(),
  )
  const [expired, setExpired] = useState(() => hasExpiredStaffSession())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<StaffAuthError | null>(null)

  // A session that expires while the iPad sits idle must not stay "signed in".
  useEffect(() => {
    if (!session) return
    // `readStaffSession` already drops an expired one, so this only has to
    // cover a session that runs out while the tab is open.
    const remaining = Math.max(0, Date.parse(session.expiresAt) - Date.now())
    const timer = window.setTimeout(() => {
      writeStaffSession(null)
      setSession(null)
      setExpired(true)
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [session])

  const login = useCallback(
    async (station: StaffStation, passcode: string) => {
      setSubmitting(true)
      setError(null)
      try {
        const next = await staffLogin(station, passcode)
        writeStaffSession(next)
        setSession(next)
        setExpired(false)
        return true
      } catch (caught) {
        setError(describe(caught))
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [],
  )

  const logout = useCallback(() => {
    writeStaffSession(null)
    setSession(null)
    setExpired(true)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    configured,
    session,
    expired,
    submitting,
    error,
    login,
    logout,
    clearError,
  }
}
