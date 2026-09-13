import { useEffect, useState } from 'react'
import { getMenuSales, type MenuSalesReport } from '../api/staff/sales'
import { hasStaffApi, isStaffAuthError } from '../api/staff/client'
import { useStaffEventState } from './useStaffEvents'
import { demoMenuSales } from '../data/sales'
import { koreaDate } from '../utils/menuSales'

export function useMenuSales(startDate: string, endDate: string) {
  const configured = hasStaffApi()
  const { revision } = useStaffEventState()
  const [result, setResult] = useState<{ key: string; data?: MenuSalesReport; error?: Error; unauthorized?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${startDate}/${endDate}`
  useEffect(() => {
    if (!configured) return
    let disposed = false
    let timer: number | undefined
    let controller: AbortController | undefined
    const run = async () => {
      if (disposed || document.hidden) return
      window.clearTimeout(timer)
      controller?.abort()
      const request = new AbortController()
      controller = request
      try {
        const data = await getMenuSales(startDate, endDate, request.signal)
        if (!disposed && !request.signal.aborted) setResult({ key, data })
      } catch (caught) {
        if (disposed || request.signal.aborted) return
        setResult({ key, error: caught instanceof Error ? caught : new Error('판매 통계를 불러오지 못했어요.'), unauthorized: isStaffAuthError(caught) })
      }
      if (!disposed && !request.signal.aborted && !document.hidden) timer = window.setTimeout(() => { void run() }, 15_000)
    }
    const refresh = () => {
      window.clearTimeout(timer)
      if (!document.hidden) void run()
      else controller?.abort()
    }
    void run()
    document.addEventListener('visibilitychange', refresh)
    return () => { disposed = true; window.clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', refresh) }
  }, [configured, startDate, endDate, key, revision, attempt])
  if (!configured) return { rows: startDate <= koreaDate() && endDate >= koreaDate() ? demoMenuSales : [], loading: false, error: undefined, unauthorized: false, retry: () => {}, demo: true }
  const current = result?.key === key ? result : null
  return { rows: current?.data?.rows ?? [], loading: !current, error: current?.error,
    unauthorized: current?.unauthorized, retry: () => setAttempt((n) => n + 1), demo: false }
}
