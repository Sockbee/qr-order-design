import { useCallback, useEffect, useRef, useState } from 'react'
import { hasAppsScriptApi } from '../api/client'
import { cancelCall, createCall } from '../api/calls'
import { readStored, sessionScopedKey, writeStored } from '../utils/storage'
import type { ActiveCall, CallReason } from '../types/call'
import type { TableCredentials } from '../types/session'

export type StaffCallPhase = 'idle' | 'submitting' | 'called' | 'cancelling'

export interface StaffCallError {
  message: string
  /** CALL_TOO_FREQUENT — the diner should wait, not retry immediately. */
  throttled: boolean
}

export interface StaffCallState {
  phase: StaffCallPhase
  activeCall: ActiveCall | null
  error: StaffCallError | null
  call: (reason: CallReason) => void
  cancel: () => void
  clearError: () => void
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Owns 직원 호출 for the whole session, so the "직원을 불렀어요" state survives
 * navigation between the menu, an item and the order history.
 *
 * The active call is persisted: a diner who refreshes mid-wait must not be
 * told to call again, and must not accidentally raise a second call that the
 * staff side then has to merge.
 */
export function useStaffCall(
  credentials: TableCredentials | null,
): StaffCallState {
  const storageKey = credentials
    ? sessionScopedKey(credentials.tableToken, 'active-call')
    : null
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(() =>
    storageKey ? readStored<ActiveCall | null>(storageKey, null) : null,
  )
  const [phase, setPhase] = useState<StaffCallPhase>(activeCall ? 'called' : 'idle')
  const [error, setError] = useState<StaffCallError | null>(null)
  /** Reused across retries so a timed-out call is not raised twice. */
  const requestIdRef = useRef<string>(newRequestId())

  useEffect(() => {
    if (!storageKey) return
    writeStored(storageKey, activeCall)
  }, [activeCall, storageKey])

  const call = useCallback(
    (reason: CallReason) => {
      setError(null)

      // Without a configured API the app runs on mock data; keep the flow
      // demoable rather than dead-ending on a network error.
      if (!credentials || !hasAppsScriptApi()) {
        setActiveCall({
          callId: `local-${newRequestId()}`,
          reason,
          createdAt: new Date().toISOString(),
        })
        setPhase('called')
        return
      }

      setPhase('submitting')
      void createCall(credentials, reason, requestIdRef.current)
        .then((next) => {
          setActiveCall(next)
          setPhase('called')
          requestIdRef.current = newRequestId()
        })
        .catch((cause: unknown) => {
          const code = cause instanceof Error && 'code' in cause
            ? String((cause as { code: unknown }).code)
            : ''
          setError({
            message: cause instanceof Error
              ? cause.message
              : '직원 호출에 실패했어요. 잠시 후 다시 시도해 주세요.',
            throttled: code === 'CALL_TOO_FREQUENT',
          })
          setPhase('idle')
        })
    },
    [credentials],
  )

  const cancel = useCallback(() => {
    if (!activeCall) return
    setError(null)

    if (!credentials || !hasAppsScriptApi() || activeCall.callId.startsWith('local-')) {
      setActiveCall(null)
      setPhase('idle')
      return
    }

    setPhase('cancelling')
    void cancelCall(credentials, activeCall.callId)
      .then(() => {
        setActiveCall(null)
        setPhase('idle')
      })
      .catch((cause: unknown) => {
        /*
         * CALL_ALREADY_RESOLVED means staff has already picked it up. That is
         * not a failure the diner should retry — the call is genuinely over,
         * so clear it and say so.
         */
        const code = cause instanceof Error && 'code' in cause
          ? String((cause as { code: unknown }).code)
          : ''
        if (code === 'CALL_ALREADY_RESOLVED') {
          setActiveCall(null)
          setPhase('idle')
          setError({ message: '직원이 이미 확인했어요. 곧 도착합니다.', throttled: false })
          return
        }
        setError({
          message: cause instanceof Error
            ? cause.message
            : '호출 취소에 실패했어요.',
          throttled: false,
        })
        setPhase('called')
      })
  }, [activeCall, credentials])

  const clearError = useCallback(() => setError(null), [])

  return { phase, activeCall, error, call, cancel, clearError }
}
