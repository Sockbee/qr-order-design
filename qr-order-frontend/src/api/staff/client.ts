import { ApiClientError } from '../client'
import { readStoredString } from '../../utils/storage'

const API_VERSION = 'v1'

/**
 * The staff API is a *separate* Apps Script deployment
 * (apps-script-api-design.md §1): the customer bundle must never ship the
 * operational URL, so this is its own env var and its own client.
 *
 * `staffToken` travels in the request body, not an Authorization header —
 * the Apps Script event object cannot read arbitrary request headers and a
 * custom header would trigger a CORS preflight (§4.9).
 */
export const STAFF_TOKEN_KEY = 'qr-order:staff:token'

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

export function hasStaffApi(): boolean {
  return Boolean(import.meta.env.VITE_STAFF_APPS_SCRIPT_URL?.trim())
}

export function readStaffToken(): string | null {
  return readStoredString(STAFF_TOKEN_KEY)
}

/**
 * These three are the re-login triggers (§4.9). They are not retryable: the
 * token is dead and backing off would just replay the same rejection.
 */
const AUTH_ERROR_CODES = new Set([
  'STAFF_TOKEN_EXPIRED',
  'STAFF_TOKEN_REVOKED',
  'STAFF_TOKEN_INVALID',
  'STAFF_TOKEN_MISSING',
])

export function isStaffAuthError(error: unknown): boolean {
  return error instanceof ApiClientError && AUTH_ERROR_CODES.has(error.code)
}

export async function callStaffApi<T>(
  action: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const configuredUrl = import.meta.env.VITE_STAFF_APPS_SCRIPT_URL?.trim()
  if (!configuredUrl) {
    throw new ApiClientError(
      'API_NOT_CONFIGURED',
      '운영 API 주소가 설정되지 않았습니다.',
      false,
    )
  }

  const staffToken = readStaffToken()
  if (!staffToken) {
    throw new ApiClientError(
      'STAFF_TOKEN_MISSING',
      '로그인이 필요합니다.',
      false,
    )
  }

  const url = new URL(configuredUrl)
  url.searchParams.set('action', action)
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ apiVersion: API_VERSION, staffToken, ...payload }),
    signal,
  })
  if (!response.ok) {
    throw new ApiClientError(
      'HTTP_ERROR',
      '운영 서버에 연결할 수 없습니다.',
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
      '운영 서버 응답을 확인할 수 없습니다.',
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
