const API_VERSION = 'v1'

type ApiMeta = {
  apiVersion: string
  requestId: string
  serverTime: string
}

type ApiEnvelope<T> =
  | { success: true; data: T; meta: ApiMeta }
  | {
      success: false
      error: {
        code: string
        message: string
        retryable: boolean
        details?: unknown
      }
      meta: ApiMeta
    }

export class ApiClientError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly details?: unknown

  constructor(
    code: string,
    message: string,
    retryable: boolean,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.retryable = retryable
    this.details = details
  }
}

export function hasAppsScriptApi(): boolean {
  return Boolean(import.meta.env.VITE_APPS_SCRIPT_URL?.trim())
}

export async function callAppsScript<T>(
  action: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const configuredUrl = import.meta.env.VITE_APPS_SCRIPT_URL?.trim()
  if (!configuredUrl) {
    throw new ApiClientError(
      'API_NOT_CONFIGURED',
      '주문 API 주소가 설정되지 않았습니다.',
      false,
    )
  }

  const url = new URL(configuredUrl)
  url.searchParams.set('action', action)
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ apiVersion: API_VERSION, ...payload }),
    signal,
  })
  if (!response.ok) {
    throw new ApiClientError(
      'HTTP_ERROR',
      '주문 서버에 연결할 수 없습니다.',
      response.status >= 500,
      { status: response.status },
    )
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      '주문 서버 응답을 확인할 수 없습니다.',
      true,
    )
  }
  if (!envelope.success) {
    throw new ApiClientError(
      envelope.error.code,
      envelope.error.message,
      envelope.error.retryable,
      envelope.error.details,
    )
  }
  return envelope.data
}
