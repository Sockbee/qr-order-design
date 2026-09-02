import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectCustomerEvents } from './events'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('customer SSE client', () => {
  it('parses chunked events and ignores heartbeat comments', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': heartbeat\r\nid: 41\r\nevent: order.'))
        controller.enqueue(encoder.encode('updated\r\ndata: {"revision":41}\r\n\r\n'))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const events: Array<{ id: string; type: string; data: unknown }> = []
    const opened = vi.fn()

    await connectCustomerEvents(
      { tableId: 'T01', tableToken: 'a'.repeat(64) },
      new AbortController().signal,
      '40',
      opened,
      (event) => events.push(event),
    )

    expect(opened).toHaveBeenCalledOnce()
    expect(events).toEqual([
      { id: '41', type: 'order.updated', data: { revision: 41 } },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/customer/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Last-Event-ID': '40' }),
      }),
    )
  })

  it('turns an unsuccessful handshake into a retryable API error', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))

    await expect(connectCustomerEvents(
      { tableId: 'T01', tableToken: 'a'.repeat(64) },
      new AbortController().signal,
      '',
      vi.fn(),
      vi.fn(),
    )).rejects.toMatchObject({
      code: 'SSE_CONNECT_FAILED',
      retryable: true,
    })
  })
})
