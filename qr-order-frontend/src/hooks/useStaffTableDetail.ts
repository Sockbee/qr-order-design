import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiClientError } from '../api/client'
import { hasStaffApi } from '../api/staff/client'
import {
  getStaffTableDetail,
  mapStaffTableDetail,
  updateStaffOrderStatus,
} from '../api/staff/detail'
import { staffTableDetail } from '../data/staff'
import type { StaffOrderStatus, StaffTableDetail } from '../types/staff'
import { useStaffEventState } from './useStaffEvents'

/** How long the dropdown holds its success tick before returning to idle. */
const SUCCESS_HOLD_MS = 1_500
const STAFF_DETAIL_FALLBACK_POLL_MS = 10_000
const STAFF_DETAIL_RECONCILE_MS = 60_000

interface StaffTableDetailState {
  detail: StaffTableDetail | null
  loading: boolean
  error: ApiClientError | null
  statusPhase: 'idle' | 'updating' | 'success'
  /** Set when a status change failed; the previous status is still shown. */
  statusError: string | null
  reload: () => void
  changeStatus: (status: StaffOrderStatus) => void
  dismissStatusError: () => void
}

function toApiError(caught: unknown): ApiClientError {
  if (caught instanceof ApiClientError) return caught
  return new ApiClientError(
    'NETWORK_ERROR',
    '운영 서버에 연결할 수 없습니다.',
    true,
  )
}

export function useStaffTableDetail(
  tableId: string | null,
): StaffTableDetailState {
  const configured = hasStaffApi()
  const { revision: eventRevision, connected: eventsConnected } = useStaffEventState()
  const [remote, setRemote] = useState<StaffTableDetail | null>(null)
  const [error, setError] = useState<ApiClientError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [statusPhase, setStatusPhase] = useState<
    'idle' | 'updating' | 'success'
  >('idle')
  const [statusError, setStatusError] = useState<string | null>(null)
  /*
   * A status the operator just set, held separately from the fetched detail
   * so it survives the next poll without the fetch having to be re-run, and
   * so the fallback path has somewhere to write.
   */
  const [statusOverride, setStatusOverride] = useState<{
    tableId: string
    status: StaffOrderStatus
  } | null>(null)

  useEffect(() => {
    if (!configured || !tableId) return

    let disposed = false
    let timer: number | undefined
    const controller = new AbortController()
    getStaffTableDetail(tableId, controller.signal)
      .then((response) => {
        if (disposed) return
        setRemote(mapStaffTableDetail(response))
        setError(null)
      })
      .catch((caught: unknown) => {
        if (disposed || controller.signal.aborted) return
        setError(toApiError(caught))
      })
      .finally(() => {
        if (!disposed) timer = window.setTimeout(
          () => setAttempt((value) => value + 1),
          eventsConnected ? STAFF_DETAIL_RECONCILE_MS : STAFF_DETAIL_FALLBACK_POLL_MS,
        )
      })

    return () => {
      disposed = true
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [attempt, configured, eventRevision, eventsConnected, tableId])

  // Drop the success tick after a beat so the control returns to idle.
  useEffect(() => {
    if (statusPhase !== 'success') return
    const timer = window.setTimeout(
      () => setStatusPhase('idle'),
      SUCCESS_HOLD_MS,
    )
    return () => window.clearTimeout(timer)
  }, [statusPhase])

  const base = useMemo(() => {
    if (!tableId) return null
    if (!configured) return staffTableDetail(tableId)
    return remote?.tableId === tableId ? remote : null
  }, [configured, remote, tableId])

  const detail = useMemo(() => {
    if (!base) return null
    if (statusOverride?.tableId !== base.tableId) return base
    return { ...base, status: statusOverride.status }
  }, [base, statusOverride])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  const changeStatus = useCallback(
    (status: StaffOrderStatus) => {
      if (!tableId) return
      setStatusPhase('updating')
      setStatusError(null)

      const settle = () => {
        // Success reflects the new status immediately (83:47).
        setStatusOverride({ tableId, status })
        setStatusPhase('success')
      }

      if (!configured) {
        settle()
        return
      }

      void updateStaffOrderStatus(tableId, status)
        .then(settle)
        .catch((caught: unknown) => {
          /*
           * The previous status has to survive a failure, and the message has
           * to say so — otherwise the operator cannot tell whether the change
           * half-landed (99:1551).
           */
          setStatusPhase('idle')
          setStatusError(toApiError(caught).message)
        })
    },
    [configured, tableId],
  )

  const dismissStatusError = useCallback(() => setStatusError(null), [])

  return {
    detail,
    loading: configured && tableId !== null && base === null && error === null,
    error,
    statusPhase,
    statusError,
    reload,
    changeStatus,
    dismissStatusError,
  }
}
