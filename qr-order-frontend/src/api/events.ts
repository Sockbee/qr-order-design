import { ApiClientError } from './client'
import { readStaffToken } from './staff/client'
import type { TableCredentials } from '../types/session'

export interface StreamEvent {
  id: string
  type: string
  data: unknown
}

interface StreamOptions {
  path: 'customer/events' | 'staff/events'
  body?: Record<string, unknown>
  token?: string | null
  lastEventId?: string
  signal: AbortSignal
  onOpen?: () => void
  onEvent: (event: StreamEvent) => void
}

async function stream(options: StreamOptions): Promise<void> {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!configuredUrl) return
  const response = await fetch(
    `${configuredUrl.replace(/\/$/, '')}/api/v1/${options.path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.lastEventId
          ? { 'Last-Event-ID': options.lastEventId }
          : {}),
      },
      body: JSON.stringify(options.body ?? {}),
      signal: options.signal,
    },
  )
  if (!response.ok || !response.body) {
    throw new ApiClientError(
      response.status === 401 ? 'STAFF_TOKEN_INVALID' : 'SSE_CONNECT_FAILED',
      '실시간 연결을 시작할 수 없습니다.',
      response.status >= 500,
      { status: response.status },
    )
  }
  options.onOpen?.()
  const reader = response.body.getReader()
  const reconnectTimer = globalThis.setTimeout(
    () => void reader.cancel('proactive reconnect'),
    24 * 60_000,
  )
  const decoder = new TextDecoder()
  let buffer = ''
  let currentId = ''
  let currentType = 'message'
  let dataLines: string[] = []

  const dispatch = () => {
    if (dataLines.length === 0) return
    const raw = dataLines.join('\n')
    let data: unknown = raw
    try {
      data = JSON.parse(raw)
    } catch {
      // A server may send a plain text diagnostic event.
    }
    options.onEvent({ id: currentId, type: currentType, data })
    dataLines = []
    currentType = 'message'
  }

  try {
    while (!options.signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line === '') dispatch()
        else if (!line.startsWith(':')) {
          const separator = line.indexOf(':')
          const field = separator < 0 ? line : line.slice(0, separator)
          const fieldValue = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
          if (field === 'id') currentId = fieldValue
          if (field === 'event') currentType = fieldValue
          if (field === 'data') dataLines.push(fieldValue)
        }
        newline = buffer.indexOf('\n')
      }
    }
  } finally {
    globalThis.clearTimeout(reconnectTimer)
  }
}

export function connectCustomerEvents(
  credentials: TableCredentials,
  signal: AbortSignal,
  lastEventId: string,
  onOpen: () => void,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return stream({
    path: 'customer/events',
    body: { ...credentials },
    signal,
    lastEventId,
    onOpen,
    onEvent,
  })
}

export function connectStaffEvents(
  signal: AbortSignal,
  lastEventId: string,
  onOpen: () => void,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  return stream({
    path: 'staff/events',
    token: readStaffToken(),
    signal,
    lastEventId,
    onOpen,
    onEvent,
  })
}
