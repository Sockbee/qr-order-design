import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiClientError } from '../api/client'
import { hasStaffApi, isStaffAuthError, readStaffSession } from '../api/staff/client'
import {
  receiveOrderCoins,
  transitionPreparation,
  getStaffQueues,
  mapKitchenQueue,
  mapPaymentQueue,
  mapServingQueue,

} from '../api/staff/stations'
import type { PreparationAction } from '../api/staff/stations'
import { demoKitchenUnits, preparationUnitIds, stationCardId, transitionDemoQueues } from '../utils/stationPreparation'
import { confirmTablePayment } from '../api/staff/operations'
import {
  staffKitchenQueue,
  staffPaymentQueue,
  staffServingQueue,
} from '../data/staff'
import { STAFF_POLL_INTERVAL_MS } from './useStaffTableHome'
import type {
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
  busyItemId: string | null
  retry: () => void
  startCooking: (order: StaffStationOrder) => void
  completeAll: (order: StaffStationOrder) => void
  receiveCoins: (orderId: string, total: number) => void
  serveReady: (order: StaffStationOrder) => void
  togglePreparation: (order: StaffStationOrder, itemId: string) => void
  confirmPayment: (
    tableId: string,
    sessionId: string,
    expectedFinalAmount: number,
    payerName: string,
  ) => Promise<void>
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
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  /** Orders resolved locally, so a card leaves immediately on tap. */
  const [received, setReceived] = useState<string[]>([])
  const [resolved, setResolved] = useState<string[]>([])
  const [demoQueues, setDemoQueues] = useState<{ kitchen: StaffStationOrder[]; serving: StaffStationOrder[] } | null>(null)
  const actionInFlight = useRef(false)
  const [paymentRecords, setPaymentRecords] = useState<Record<string, { payerName: string; paymentConfirmedBy: string; paidAt: string }>>({})
  const paymentRequestIds = useRef(new Map<string, string>())

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
    const kitchen = demoKitchenUnits(staffKitchenQueue())
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

  const transition = useCallback(
    (order: StaffStationOrder, unitIds: string[], action: PreparationAction, itemId?: string) => {
      if (actionInFlight.current) return
      actionInFlight.current = true
      setBusyId(stationCardId(order))
      setBusyItemId(itemId ?? null)
      setError(null)
      const request = configured ? transitionPreparation(order.orderId, unitIds, action) : Promise.resolve()
      void request.then(() => {
        if (configured) setAttempt((value) => value + 1)
        else setDemoQueues((current) => transitionDemoQueues(current ?? fallback, order, unitIds, action, crypto.randomUUID()))
      }).catch((caught: unknown) => { setError(toApiError(caught)); setAttempt((value) => value + 1) })
        .finally(() => { actionInFlight.current = false; setBusyId(null); setBusyItemId(null) })
    }, [configured, fallback],
  )

  const confirmPayment = useCallback(
    async (tableId: string, sessionId: string, expectedFinalAmount: number, payerName: string) => {
      const requestKey = JSON.stringify([sessionId, expectedFinalAmount, payerName.trim()])
      const clientRequestId = paymentRequestIds.current.get(requestKey) ?? crypto.randomUUID()
      paymentRequestIds.current.set(requestKey, clientRequestId)
      setBusyId(tableId)
      try {
        if (configured) await confirmTablePayment(tableId, sessionId, clientRequestId, expectedFinalAmount, payerName.trim())
        paymentRequestIds.current.delete(requestKey)
        setPaymentRecords((current) => ({ ...current, [sessionId]: {
          payerName: payerName.trim(), paymentConfirmedBy: configured ? (readStaffSession()?.deviceLabel ?? '운영 기기') : '데모 운영자', paidAt: new Date().toISOString(),
        } }))
        setResolved((current) => [...current, `payment:${sessionId}`])
        if (configured) setAttempt((value) => value + 1)
      } catch (caught) {
        throw toApiError(caught)
      } finally {
        setBusyId(null)
      }
    },
    [configured],
  )

  const visible = useMemo(() => {
    if (!base) return null
    const queues = configured ? base : (demoQueues ?? base)
    const kitchen = queues.kitchen
    const serving = queues.serving.map((order) => received.includes(order.orderId) ? { ...order, coinReceived: true } : order)
    const payment = base.payment.map((row) =>
      resolved.includes(`payment:${row.sessionId}`)
        ? { ...row, ...paymentRecords[row.sessionId], bill: { ...row.bill, paid: true } }
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
  }, [base, configured, demoQueues, resolved, paymentRecords, received])

  return {
    kitchen: visible?.kitchen ?? [],
    serving: visible?.serving ?? [],
    payment: visible?.payment ?? [],
    counts: visible?.counts ?? null,
    loading: configured && data === null && error === null,
    error,
    unauthorized: isStaffAuthError(error),
    busyId,
    busyItemId,
    retry: useCallback(() => {
      setError(null)
      setAttempt((value) => value + 1)
    }, []),
    startCooking: useCallback(
      (order) => transition(order, preparationUnitIds(order), 'START'),
      [transition],
    ),
    completeAll: useCallback(
      (order) => transition(order, preparationUnitIds(order), 'COMPLETE'),
      [transition],
    ),
    receiveCoins: useCallback((orderId, total) => {
      setBusyId(orderId)
      const action = configured ? receiveOrderCoins(orderId, total) : Promise.resolve()
      void action.then(() => { setReceived((current) => [...current, orderId]); setAttempt((value) => value + 1) })
        .catch((caught: unknown) => setError(toApiError(caught))).finally(() => setBusyId(null))
    }, [configured]),
    serveReady: useCallback(
      (order) => transition(order, preparationUnitIds(order), 'SERVE'),
      [transition],
    ),
    togglePreparation: useCallback((order, itemId) => transition(order, [itemId], order.status === 'new' ? 'START' : 'COMPLETE', itemId), [transition]),
    confirmPayment,
  }
}
