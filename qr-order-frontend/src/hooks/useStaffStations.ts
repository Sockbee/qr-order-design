import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiClientError } from '../api/client'
import { hasStaffApi, isStaffAuthError } from '../api/staff/client'
import {
  advanceStaffOrder,
  getStaffQueues,
  mapKitchenQueue,
  mapPaymentQueue,
  mapServingQueue,
} from '../api/staff/stations'
import { confirmTablePayment } from '../api/staff/operations'
import {
  staffKitchenQueue,
  staffPaymentQueue,
  staffServingQueue,
} from '../data/staff'
import { STAFF_POLL_INTERVAL_MS } from './useStaffTableHome'
import type {
  StaffOrderStatus,
  StaffPaymentOrder,
  StaffStationCounts,
  StaffStationOrder,
} from '../types/staff'
import { useStaffEventState } from './useStaffEvents'

const MAX_POLL_INTERVAL_MS = 60_000
const SSE_RECONCILE_INTERVAL_MS = 60_000

interface StaffStationsState {
  kitchen: StaffStationOrder[]
  serving: StaffStationOrder[]
  payment: StaffPaymentOrder[]
  counts: StaffStationCounts | null
  loading: boolean
  error: ApiClientError | null
  unauthorized: boolean
  busyId: string | null
  retry: () => void
  advance: (orderId: string, status: StaffOrderStatus) => void
  confirmPayment: (tableId: string, expectedFinalAmount: number) => void
}

function toApiError(caught: unknown): ApiClientError {
  if (caught instanceof ApiClientError) return caught
  return new ApiClientError(
    'NETWORK_ERROR',
    '운영 서버에 연결할 수 없습니다.',
    true,
  )
}

/**
 * One poll for all three stations. The rail badge has to show the same four
 * numbers on every screen, so splitting this per station would mean three
 * polls on each of them.
 */
export function useStaffStations(): StaffStationsState {
  const configured = hasStaffApi()
  const { revision: eventRevision, connected: eventsConnected } = useStaffEventState()
  const [data, setData] = useState<{
    kitchen: StaffStationOrder[]
    serving: StaffStationOrder[]
    payment: StaffPaymentOrder[]
    counts: StaffStationCounts
  } | null>(null)
  const [error, setError] = useState<ApiClientError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Orders resolved locally, so a card leaves immediately on tap. */
  const [resolved, setResolved] = useState<string[]>([])

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
      timer = window.setTimeout(run, delay)
    }

    const run = async () => {
      if (disposed || document.hidden) return
      controller?.abort()
      const requestController = new AbortController()
      controller = requestController
      try {
        const response = await getStaffQueues(requestController.signal)
        if (disposed) return
        failureCount = 0
        setData({
          kitchen: mapKitchenQueue(response),
          serving: mapServingQueue(response),
          payment: mapPaymentQueue(response),
          counts: response.counts,
        })
        setResolved([])
        setError(null)
        schedule(eventsConnected ? SSE_RECONCILE_INTERVAL_MS : STAFF_POLL_INTERVAL_MS)
      } catch (caught) {
        if (disposed || requestController.signal.aborted) return
        const apiError = toApiError(caught)
        setError(apiError)
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
  }, [attempt, configured, eventRevision, eventsConnected])

  const fallback = useMemo(() => {
    const kitchen = staffKitchenQueue()
    const serving = staffServingQueue()
    const payment = staffPaymentQueue()
    return {
      kitchen,
      serving,
      payment,
      counts: {
        tables: 2,
        kitchen: kitchen.length,
        serving: serving.length,
        payment: payment.filter((row) => !row.bill.paid).length,
      },
    }
  }, [])

  const base = data ?? (configured ? null : fallback)

  const advance = useCallback(
    (orderId: string, status: StaffOrderStatus) => {
      /*
       * The card leaves the queue on tap. A station screen is worked with both
       * hands full, so waiting for a round trip before the ticket disappears
       * is how the same order gets started twice.
       */
      const resolve = () => setResolved((current) => [...current, orderId])
      if (!configured) {
        resolve()
        return
      }
      setBusyId(orderId)
      void advanceStaffOrder(orderId, status)
        .then(resolve)
        .catch((caught: unknown) => setError(toApiError(caught)))
        .finally(() => setBusyId(null))
    },
    [configured],
  )

  const confirmPayment = useCallback(
    (tableId: string, expectedFinalAmount: number) => {
      const resolve = () => setResolved((current) => [...current, tableId])
      if (!configured) {
        resolve()
        return
      }
      setBusyId(tableId)
      void confirmTablePayment(tableId, expectedFinalAmount)
        .then(resolve)
        .catch((caught: unknown) => setError(toApiError(caught)))
        .finally(() => setBusyId(null))
    },
    [configured],
  )

  const visible = useMemo(() => {
    if (!base) return null
    const kitchen = base.kitchen.filter(
      (order) => !resolved.includes(order.orderId),
    )
    const serving = base.serving.filter(
      (order) => !resolved.includes(order.orderId),
    )
    const payment = base.payment.map((row) =>
      resolved.includes(row.tableId)
        ? { ...row, bill: { ...row.bill, paid: true } }
        : row,
    )
    return {
      kitchen,
      serving,
      payment,
      /*
       * Station badges are derived from what is on screen, so clearing a
       * queue drops the rail count immediately instead of waiting for the
       * next poll. `tables` is an attention count only the server can know.
       */
      counts: {
        tables: base.counts.tables,
        kitchen: kitchen.length,
        serving: serving.length,
        payment: payment.filter((row) => !row.bill.paid).length,
      },
    }
  }, [base, resolved])

  return {
    kitchen: visible?.kitchen ?? [],
    serving: visible?.serving ?? [],
    payment: visible?.payment ?? [],
    counts: visible?.counts ?? null,
    loading: configured && data === null && error === null,
    error,
    unauthorized: isStaffAuthError(error),
    busyId,
    retry: useCallback(() => {
      setError(null)
      setAttempt((value) => value + 1)
    }, []),
    advance,
    confirmPayment,
  }
}
