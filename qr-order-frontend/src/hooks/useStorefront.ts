import { useCallback, useEffect, useState } from 'react'
import { fetchStorefront } from '../api/catalog'
import type { StorefrontData } from '../api/catalog'
import { ApiClientError, hasAppsScriptApi } from '../api/client'
import type { TableCredentials } from '../types/session'

interface StorefrontState {
  configured: boolean
  enabled: boolean
  data: StorefrontData | null
  loading: boolean
  error: Error | null
  retryable: boolean
  retry: () => void
}

export function useStorefront(
  credentials: TableCredentials | null,
): StorefrontState {
  const configured = hasAppsScriptApi()
  const enabled = credentials !== null && configured
  const sessionKey = credentials
    ? `${credentials.tableId}:${credentials.tableToken}`
    : ''
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${sessionKey}:${attempt}`
  const [result, setResult] = useState<{
    key: string
    data: StorefrontData | null
    error: Error | null
  }>({ key: '', data: null, error: null })

  useEffect(() => {
    if (!enabled || !credentials) return
    const controller = new AbortController()
    let disposed = false

    void fetchStorefront(credentials, controller.signal)
      .then((data) => {
        if (!disposed) setResult({ key: requestKey, data, error: null })
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return
        const safeError = error instanceof Error ? error : new Error(String(error))
        setResult({ key: requestKey, data: null, error: safeError })
      })

    return () => {
      disposed = true
      controller.abort()
    }
  }, [credentials, enabled, requestKey])

  const retry = useCallback(() => setAttempt((current) => current + 1), [])
  const hasCurrentResult = result.key === requestKey
  const error = hasCurrentResult ? result.error : null

  return {
    configured,
    enabled,
    data: hasCurrentResult ? result.data : null,
    loading: enabled && !hasCurrentResult,
    error,
    retryable: error !== null &&
      (!(error instanceof ApiClientError) || error.retryable),
    retry,
  }
}
