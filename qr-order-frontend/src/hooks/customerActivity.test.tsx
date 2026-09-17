// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customerIdleMs, useCustomerActivity } from './useCustomerActivity'
import { useOrderPolling } from './useOrderPolling'

const mocks = vi.hoisted(() => ({ list: vi.fn(), stream: vi.fn() }))
vi.mock('../api/client', () => ({ hasApi: () => true }))
vi.mock('../api/orders', () => ({ listOrders: mocks.list }))
vi.mock('../api/events', () => ({ connectCustomerEvents: mocks.stream }))
const credentials = { tableId: 'T01', tableToken: 'test-token' }
let root: Root
let host: HTMLDivElement
let signals: AbortSignal[]
let catalogChanges: number
let removeCatalog: () => void

function Customer({ path }: { path: string }) {
  const idle = useCustomerActivity(path)
  const polling = useOrderPolling(credentials, idle)
  return <div>{idle ? 'idle' : 'active'}:{polling.revision}</div>
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}
async function render(path = '/menu') {
  await act(async () => root.render(<Customer path={path} />))
  await advance(501)
}
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  signals = []
  mocks.list.mockReset().mockResolvedValue({ orders: [], activeCall: null })
  mocks.stream.mockReset().mockImplementation((_credentials, signal: AbortSignal, _id, connected) => {
    signals.push(signal)
    connected()
    return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
  })
  catalogChanges = 0
  const listener = () => { catalogChanges += 1 }
  window.addEventListener('qr-order:catalog-changed', listener)
  removeCatalog = () => window.removeEventListener('qr-order:catalog-changed', listener)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  removeCatalog()
  host.remove()
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})
describe('customer activity and polling lifecycle', () => {
  it('stops SSE, reads and retries after five minutes, then refreshes on interaction', async () => {
    await render()
    await advance(300_000)
    expect(host.textContent).toContain('idle:')
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    const count = mocks.list.mock.calls.length
    await advance(120_000)
    expect(mocks.list).toHaveBeenCalledTimes(count)
    await act(async () => { window.dispatchEvent(new Event('pointerdown')) })
    await advance(501)
    expect(catalogChanges).toBe(1)
    expect(host.textContent).toContain('active:')
    expect(mocks.list).toHaveBeenCalledTimes(count + 1)
    expect(signals.filter((signal) => !signal.aborted)).toHaveLength(1)
  })
  it('input extends the timer and route changes recover without duplicate streams', async () => {
    await render()
    await advance(240_000)
    await act(async () => { window.dispatchEvent(new Event('keydown')) })
    await advance(240_000)
    expect(host.textContent).toContain('active:')
    await advance(60_000)
    expect(host.textContent).toContain('idle:')
    await render('/orders')
    await advance(600_000)
    expect(host.textContent).toContain('active:')
    await render('/menu')
    expect(host.textContent).toContain('active:')
    expect(signals.filter((signal) => !signal.aborted)).toHaveLength(1)
  })
  it.each(['/cart', '/cart/confirm', '/orders', '/orders/1042/done', '/event'])('does not idle %s', async (path) => {
    await render(path)
    await advance(600_000)
    expect(host.textContent).toContain('active:')
    expect(signals.filter((signal) => !signal.aborted)).toHaveLength(1)
  })
  it.each(['/menu', '/cart/confirm'])('pauses when hidden and restores one connection on %s', async (path) => {
    await render(path)
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      const reads = mocks.list.mock.calls.length
      await advance(600_000)
      expect(mocks.list).toHaveBeenCalledTimes(reads)
      expect(signals.filter((signal) => !signal.aborted)).toHaveLength(0)
      await act(async () => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await advance(501)
      expect(signals.filter((signal) => !signal.aborted)).toHaveLength(1)
    }
    expect(catalogChanges).toBe(3)
  })
  it('stops fallback reads and reconnects even when the network is failing', async () => {
    mocks.list.mockRejectedValue(new Error('offline'))
    mocks.stream.mockRejectedValue(new Error('offline'))
    await render()
    await advance(300_000)
    const reads = mocks.list.mock.calls.length
    const streams = mocks.stream.mock.calls.length
    await advance(600_000)
    expect(mocks.list).toHaveBeenCalledTimes(reads)
    expect(mocks.stream).toHaveBeenCalledTimes(streams)
  })
  it('validates the configurable timeout', () => {
    expect(customerIdleMs(undefined)).toBe(300_000)
    expect(customerIdleMs('bad')).toBe(300_000)
    expect(customerIdleMs('-1')).toBe(300_000)
    expect(customerIdleMs('1000')).toBe(1000)
  })
})
