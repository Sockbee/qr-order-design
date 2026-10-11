// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFloorPlanView } from './useFloorPlanView'

let root: Root
let host: HTMLDivElement
function View() {
  const [view, setView] = useFloorPlanView()
  return <button onClick={() => setView(view === 'window' ? 'pos' : 'window')}>{view}</button>
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    clear: () => saved.clear(),
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => {
    window.localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    root.unmount()
  })
  host.remove()
  vi.unstubAllGlobals()
})

it('opens the current QR drawing even when the old layout saved a rotated view', async () => {
  window.localStorage.setItem('qr-order:staff:floor-plan-view', 'pos')
  await act(async () => root.render(<View />))
  expect(host.textContent).toBe('window')
})

it('shares the chosen rotation across maps and restores it when remounted', async () => {
  await act(async () => root.render(<><View /><View /></>))
  await act(async () => host.querySelector('button')!.click())
  expect(host.textContent).toBe('pospos')
  await act(async () => root.unmount())
  root = createRoot(host)
  await act(async () => root.render(<View />))
  expect(host.textContent).toBe('pos')
})
