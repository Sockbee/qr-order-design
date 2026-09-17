import { useMemo, useSyncExternalStore } from 'react'

export function customerIdleMs(value: unknown): number {
  const milliseconds = Number(value)
  return Number.isFinite(milliseconds) && milliseconds >= 1_000 && milliseconds <= 86_400_000
    ? milliseconds : 5 * 60_000
}

export const CUSTOMER_IDLE_MS = customerIdleMs(import.meta.env.VITE_CUSTOMER_IDLE_MS)

function activityStore(canIdle: boolean) {
  let idle = false
  return {
    getSnapshot: () => idle,
    subscribe(notify: () => void) {
      const refreshCatalog = () => window.dispatchEvent(new Event('qr-order:catalog-changed'))
      if (!canIdle) {
        const visibility = () => { if (!document.hidden) refreshCatalog() }
        document.addEventListener('visibilitychange', visibility)
        return () => document.removeEventListener('visibilitychange', visibility)
      }
      let timer: number | undefined
      const arm = () => {
        window.clearTimeout(timer)
        if (!document.hidden) timer = window.setTimeout(() => {
          idle = true
          notify()
        }, CUSTOMER_IDLE_MS)
      }
      const resume = (refresh = false) => {
        if (document.hidden) return
        if (idle) {
          idle = false
          notify()
          refresh = true
        }
        if (refresh) refreshCatalog()
        arm()
      }
      const interaction = () => resume()
      const visibility = () => {
        if (document.hidden) window.clearTimeout(timer)
        else resume(true)
      }
      const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
      events.forEach((event) => window.addEventListener(event, interaction, { passive: true }))
      document.addEventListener('visibilitychange', visibility)
      arm()
      return () => {
        window.clearTimeout(timer)
        events.forEach((event) => window.removeEventListener(event, interaction))
        document.removeEventListener('visibilitychange', visibility)
      }
    },
  }
}

/** Only browsing can idle. Cart, submission, receipt, status and event ordering stay active. */
export function useCustomerActivity(pathname: string) {
  const store = useMemo(() => activityStore(pathname === '/menu' || pathname.startsWith('/menu/')), [pathname])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false)
}
