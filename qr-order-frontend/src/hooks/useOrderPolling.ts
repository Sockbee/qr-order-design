import { useEffect, useState } from 'react'
import { hasApi } from '../api/client'
import { connectCustomerEvents } from '../api/events'
import { listOrders } from '../api/orders'
import type { OrderListResponse } from '../api/orders'
import type { TableCredentials } from '../types/session'

export const ORDER_POLL_INTERVAL_MS = 15_000
const MAX_POLL_INTERVAL_MS = 60_000
const MAX_JITTER_MS = 2_000
const SSE_RECONCILE_INTERVAL_MS = 60_000

interface OrderPollingState {
  enabled: boolean
  data: OrderListResponse | null
  initialLoading: boolean
  lastError: Error | null
}

/**
 * One polling loop per table session. Hidden tabs make no requests; returning
 * to the tab triggers an immediate refresh. Failed requests keep the last
 * successful data and back off from 15 to 30 to 60 seconds.
 */
export function useOrderPolling(
  credentials: TableCredentials | null,
): OrderPollingState {
  const enabled = credentials !== null && hasApi()
  const sessionKey = credentials
    ? `${credentials.tableId}:${credentials.tableToken}`
    : ''
  const [data, setData] = useState<OrderListResponse | null>(null)
  const [lastError, setLastError] = useState<Error | null>(null)
  const [resultSessionKey, setResultSessionKey] = useState('')

  useEffect(() => {
    if (!enabled || !credentials) return

    let disposed = false
    let failureCount = 0
    let streamFailureCount = 0
    let streamConnected = false
    let lastEventId = ''
    let lastNumericEventId = 0
    let timer: number | undefined
    let controller: AbortController | null = null
    let streamController: AbortController | null = null
    let streamTimer: number | undefined

    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
    }

    const schedule = (delay: number) => {
      clearTimer()
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
        const next = await listOrders(credentials, requestController.signal)
        if (disposed) return
        failureCount = 0
        setData(next)
        setLastError(null)
        setResultSessionKey(sessionKey)
        schedule(streamConnected ? SSE_RECONCILE_INTERVAL_MS : ORDER_POLL_INTERVAL_MS)
      } catch (error) {
        if (disposed || requestController.signal.aborted) return
        failureCount += 1
        setLastError(error instanceof Error ? error : new Error(String(error)))
        setResultSessionKey(sessionKey)
        const backoff = Math.min(
          ORDER_POLL_INTERVAL_MS * 2 ** failureCount,
          MAX_POLL_INTERVAL_MS,
        )
        schedule(backoff)
      }
    }

    const startStream = () => {
      if (disposed || document.hidden || streamController) return
      const next = new AbortController()
      streamController = next
      void connectCustomerEvents(
        credentials,
        next.signal,
        lastEventId,
        () => {
          streamConnected = true
          streamFailureCount = 0
          schedule(SSE_RECONCILE_INTERVAL_MS)
        },
        (event) => {
          const numericId = Number(event.id)
          if (event.id && Number.isFinite(numericId) && numericId <= lastNumericEventId) return
          if (event.id) {
            lastEventId = event.id
            if (Number.isFinite(numericId)) lastNumericEventId = numericId
          }
          if (event.type === 'menu.updated' ||
              event.type === 'catalog.updated' ||
              event.type === 'settings.updated') {
            window.dispatchEvent(new Event('qr-order:catalog-changed'))
          }
          if (event.type !== 'connected') void run()
        },
      ).catch(() => {
        // The polling loop remains the fallback.
      }).finally(() => {
        if (streamController !== next) return
        streamController = null
        streamConnected = false
        if (disposed || document.hidden) return
        streamFailureCount += 1
        streamTimer = window.setTimeout(
          startStream,
          Math.min(1_000 * 2 ** streamFailureCount, 30_000),
        )
        schedule(ORDER_POLL_INTERVAL_MS)
      })
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimer()
        controller?.abort()
        streamController?.abort()
        streamController = null
        if (streamTimer !== undefined) window.clearTimeout(streamTimer)
        return
      }
      void run()
      startStream()
    }

    void run()
    startStream()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      clearTimer()
      controller?.abort()
      streamController?.abort()
      if (streamTimer !== undefined) window.clearTimeout(streamTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [credentials, enabled, sessionKey])

  const hasCurrentResult = resultSessionKey === sessionKey
  return {
    enabled,
    data: hasCurrentResult ? data : null,
    initialLoading: enabled && !hasCurrentResult,
    lastError: hasCurrentResult ? lastError : null,
  }
}
