import { useEffect, useState } from 'react'
import { hasAppsScriptApi } from '../api/client'
import { listOrders } from '../api/orders'
import type { OrderListResponse } from '../api/orders'
import type { TableCredentials } from '../types/session'

export const ORDER_POLL_INTERVAL_MS = 15_000
const MAX_POLL_INTERVAL_MS = 60_000
const MAX_JITTER_MS = 2_000

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
  const enabled = credentials !== null && hasAppsScriptApi()
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
    let timer: number | undefined
    let controller: AbortController | null = null

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
        schedule(ORDER_POLL_INTERVAL_MS)
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

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimer()
        controller?.abort()
        return
      }
      void run()
    }

    void run()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      clearTimer()
      controller?.abort()
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
