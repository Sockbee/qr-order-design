// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useStaffEventState } from './useStaffEvents'

const mocks = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('../api/events', () => ({ connectStaffEvents: mocks.connect }))
vi.mock('../api/staff/client', () => ({ hasStaffApi: () => true }))

it('shares one staff stream, coalesces a burst without starving sustained updates, and cleans up', async () => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  let emit: (event: { id: string; type: string }) => void = () => {}
  let signal: AbortSignal | undefined
  mocks.connect.mockImplementation((active, _lastId, connected, onEvent) => {
    signal = active
    emit = onEvent
    connected()
    return new Promise<void>((resolve) => active.addEventListener('abort', () => resolve(), { once: true }))
  })
  function Staff() {
    const state = useStaffEventState()
    return <span>{state.revision}:{String(state.connected)}</span>
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () => root.render(<><Staff /><Staff /></>))
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    await act(async () => {
      for (let i = 1; i <= 50; i++) emit({ id: String(i), type: 'order.created' })
      await vi.advanceTimersByTimeAsync(99)
    })
    expect(host.textContent).toBe('0:true0:true')
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(host.textContent).toBe('1:true1:true')
    await act(async () => {
      emit({ id: '50', type: 'order.created' }) // Cursor deduplication survives batching.
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(host.textContent).toBe('1:true1:true')
    for (let i = 51; i <= 53; i++) {
      await act(async () => {
        emit({ id: String(i), type: 'order.created' })
        await vi.advanceTimersByTimeAsync(100)
      })
    }
    expect(host.textContent).toBe('4:true4:true')
    await act(async () => {
      emit({ id: '54', type: 'order.created' })
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(600_000)
    })
    expect(signal?.aborted).toBe(true)
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('4:false4:false')
  } finally {
    await act(async () => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  }
})
