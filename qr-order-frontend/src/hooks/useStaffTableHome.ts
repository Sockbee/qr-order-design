import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiClientError } from '../api/client'
import { hasStaffApi, isStaffAuthError } from '../api/staff/client'
import {
  buildTableHomeData,
  listStaffTables,
  mapStaffTables,
} from '../api/staff/tables'
import {
  acknowledgeStaffCall,
  listStaffCalls,
  mapStaffCallGroups,
} from '../api/staff/calls'
import {
  staffCallGroups,
  staffKitchenQueue,
  staffPaymentQueue,
  staffServingQueue,
  staffTables,
} from '../data/staff'
import type { StaffCallGroup, StaffTableHomeData } from '../types/staff'

/**
 * 10s, tighter than the customer app's 15s: a call sitting unseen is the
 * failure this screen exists to prevent, and one iPad polling one deployment
 * is a very different budget from every phone in the room.
 */
export const STAFF_POLL_INTERVAL_MS = 10_000
const MAX_POLL_INTERVAL_MS = 60_000
const MAX_JITTER_MS = 1_000

/**
 * How long an acknowledged row stays on screen as 확인됨 before it drops out.
 * The row has to visibly resolve, or staff cannot tell their tap registered.
 */
const ACKNOWLEDGED_ROW_TTL_MS = 5_000

/**
 * A thrown fetch is a network failure, not a message for the operator —
 * "TypeError: Failed to fetch" must never reach the alert.
 */
function toApiError(caught: unknown): ApiClientError {
  if (caught instanceof ApiClientError) return caught
  return new ApiClientError(
    'NETWORK_ERROR',
    '운영 서버에 연결할 수 없습니다.',
    true,
  )
}

interface StaffTableHomeState {
  configured: boolean
  data: StaffTableHomeData | null
  loading: boolean
  error: ApiClientError | null
  retryable: boolean
  /** The token is dead or absent — A09 login is the only way forward. */
  unauthorized: boolean
  acknowledgingTableId: string | null
  retry: () => void
  acknowledge: (tableId: string) => void
}

export function useStaffTableHome(): StaffTableHomeState {
  const configured = hasStaffApi()
  const [data, setData] = useState<StaffTableHomeData | null>(null)
  const [error, setError] = useState<ApiClientError | null>(null)
  const [loading, setLoading] = useState(configured)
  const [attempt, setAttempt] = useState(0)
  const [acknowledgingTableId, setAcknowledgingTableId] = useState<
    string | null
  >(null)
  const [acknowledged, setAcknowledged] = useState<StaffCallGroup[]>([])
  const acknowledgedTimers = useRef<number[]>([])

  const fallback = useMemo(
    () => buildTableHomeData(staffTables, staffCallGroups, {
      tables: 0,
      kitchen: staffKitchenQueue().length,
      serving: staffServingQueue().length,
      payment: staffPaymentQueue().filter((row) => !row.bill.paid).length,
    }),
    [],
  )

  useEffect(() => {
    if (!configured) return

    let disposed = false
    let failureCount = 0
    let timer: number | undefined
    let controller: AbortController | null = null

    const schedule = (delay: number) => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      if (disposed || document.hidden) return
      const jitter = Math.floor(Math.random() * (MAX_JITTER_MS + 1))
      timer = window.setTimeout(run, delay + jitter)
    }

    const run = async () => {
      if (disposed || document.hidden) return
      controller?.abort()
      const requestController = new AbortController()
      controller = requestController
      try {
        const [tables, calls] = await Promise.all([
          listStaffTables(requestController.signal),
          listStaffCalls(requestController.signal),
        ])
        if (disposed) return
        failureCount = 0
        setData(
          buildTableHomeData(
            mapStaffTables(tables),
            mapStaffCallGroups(calls),
            tables.stationCounts,
          ),
        )
        setError(null)
        setLoading(false)
        schedule(STAFF_POLL_INTERVAL_MS)
      } catch (caught) {
        if (disposed || requestController.signal.aborted) return
        const apiError = toApiError(caught)
        setError(apiError)
        setLoading(false)
        // A dead token will never recover by retrying — stop the loop.
        if (isStaffAuthError(apiError)) return
        failureCount += 1
        schedule(
          Math.min(
            STAFF_POLL_INTERVAL_MS * 2 ** failureCount,
            MAX_POLL_INTERVAL_MS,
          ),
        )
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timer !== undefined) window.clearTimeout(timer)
        timer = undefined
        controller?.abort()
        return
      }
      void run()
    }

    void run()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [attempt, configured])

  useEffect(() => {
    const timers = acknowledgedTimers.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    setAttempt((value) => value + 1)
  }, [])

  const acknowledge = useCallback(
    (tableId: string) => {
      const source = (configured ? data : fallback)?.callGroups ?? []
      const group = source.find((candidate) => candidate.tableId === tableId)
      if (!group || group.acknowledged) return

      const resolve = () => {
        setAcknowledged((current) => [
          ...current.filter((row) => row.tableId !== tableId),
          { ...group, acknowledged: true },
        ])
        const timer = window.setTimeout(() => {
          setAcknowledged((current) =>
            current.filter((row) => row.tableId !== tableId),
          )
        }, ACKNOWLEDGED_ROW_TTL_MS)
        acknowledgedTimers.current.push(timer)
      }

      if (!configured) {
        // Fallback mode has no server to confirm against.
        setData((current) => {
          const base = current ?? fallback
          return buildTableHomeData(
            base.tables.map((table) =>
              table.tableId === tableId ? { ...table, hasCall: false } : table,
            ),
            base.callGroups.filter((row) => row.tableId !== tableId),
            base.stationCounts,
          )
        })
        resolve()
        return
      }

      setAcknowledgingTableId(tableId)
      void acknowledgeStaffCall(tableId)
        .then(() => {
          setData((current) =>
            current
              ? buildTableHomeData(
                  current.tables.map((table) =>
                    table.tableId === tableId
                      ? { ...table, hasCall: false }
                      : table,
                  ),
                  current.callGroups.filter((row) => row.tableId !== tableId),
                  current.stationCounts,
                )
              : current,
          )
          resolve()
        })
        .catch((caught: unknown) => {
          setError(toApiError(caught))
        })
        .finally(() => setAcknowledgingTableId(null))
    },
    [configured, data, fallback],
  )

  /*
   * `data` wins as soon as it exists — including in fallback mode, where
   * acknowledging writes into it. Reading the seed unconditionally would
   * silently discard every local update.
   */
  const resolved = data ?? (configured ? null : fallback)
  const withAcknowledged = useMemo(() => {
    if (!resolved) return null
    if (acknowledged.length === 0) return resolved
    // Oldest first, so a row does not jump when it turns 확인됨.
    const callGroups = [...resolved.callGroups, ...acknowledged].sort(
      (a, b) => Date.parse(a.firstCalledAt) - Date.parse(b.firstCalledAt),
    )
    return { ...resolved, callGroups }
  }, [acknowledged, resolved])

  return {
    configured,
    data: withAcknowledged,
    loading: configured && loading && data === null,
    error,
    retryable: error?.retryable ?? false,
    unauthorized: isStaffAuthError(error),
    acknowledgingTableId,
    retry,
    acknowledge,
  }
}
