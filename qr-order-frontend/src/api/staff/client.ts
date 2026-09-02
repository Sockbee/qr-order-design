import { ApiClientError } from '../client'
import { readStored, writeStored } from '../../utils/storage'

const API_VERSION = 'v1'

/**
 * Staff and customer actions share one Spring Boot API origin. Staff calls
 * authenticate with the standard Bearer token issued by the login endpoint.
 */
export const STAFF_TOKEN_KEY = 'qr-order:staff:token'

/** The four stations A09 offers. Anything else is `INVALID_DEVICE_LABEL`. */
export const STAFF_STATIONS = ['카운터', '주방', '서빙', '결제'] as const
export type StaffStation = (typeof STAFF_STATIONS)[number]

export interface StaffSession {
  staffToken: string
  deviceLabel: StaffStation
  /** ISO timestamp. Checked locally so a dead token never leaves the device. */
  expiresAt: string
}

export function readStaffSession(): StaffSession | null {
  const stored = readStored<StaffSession | null>(STAFF_TOKEN_KEY, null)
  if (!stored?.staffToken || !stored.expiresAt) return null
  if (Date.parse(stored.expiresAt) <= Date.now()) return null
  return stored
}

/**
 * True when a session was stored but has run out — the difference between
 * "never signed in" and "signed in this morning, came back after 14 hours".
 * A09 shows a calmer message for the second case.
 */
export function hasExpiredStaffSession(): boolean {
  const stored = readStored<StaffSession | null>(STAFF_TOKEN_KEY, null)
  if (!stored?.expiresAt) return false
  return Date.parse(stored.expiresAt) <= Date.now()
}

export function writeStaffSession(session: StaffSession | null): void {
  writeStored(STAFF_TOKEN_KEY, session)
}

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
  return Boolean(import.meta.env.VITE_API_BASE_URL?.trim())
}

export function readStaffToken(): string | null {
  return readStaffSession()?.staffToken ?? null
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
  'STAFF_AUTH_REQUIRED',
])

export function isStaffAuthError(error: unknown): boolean {
  return error instanceof ApiClientError && AUTH_ERROR_CODES.has(error.code)
}

/**
 * `/staff/login` is the one operational endpoint without a `staffToken` —
 * it is what issues one.
 */
export async function callStaffApi<T>(
  action: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
  options: { anonymous?: boolean } = {},
): Promise<T> {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!configuredUrl) {
    throw new ApiClientError(
      'API_NOT_CONFIGURED',
      '운영 API 주소가 설정되지 않았습니다.',
      false,
    )
  }

  let staffToken: string | null = null
  if (!options.anonymous) {
    staffToken = readStaffToken()
    if (!staffToken) {
      throw new ApiClientError(
        'STAFF_TOKEN_MISSING',
        '로그인이 필요합니다.',
        false,
      )
    }
  }

  const staffAction = action.startsWith('staff/') ? action : `staff/${action}`
  const baseUrl = configuredUrl.replace(/\/$/, '')
  const url = `${baseUrl}/api/v1/${staffAction}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(staffToken ? { Authorization: `Bearer ${staffToken}` } : {}),
    },
    body: JSON.stringify({
      apiVersion: API_VERSION,
      ...payload,
    }),
    signal,
  })
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
  if (!response.ok) {
    throw new ApiClientError(
      'HTTP_ERROR',
      '운영 서버에 연결할 수 없습니다.',
      response.status >= 500,
      { status: response.status },
    )
  }
  return envelope.data
}
