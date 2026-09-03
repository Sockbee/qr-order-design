import type { StaffNavItem } from './StaffNavigation'
import type { StaffStationCounts } from '../../types/staff'

/**
 * The one rail definition every staff screen renders.
 *
 * It used to be copy-pasted into each page, which was survivable at five
 * items and stopped being so at six — a rail that disagrees with itself
 * between screens is worse than no rail.
 *
 * 서비스 sits fifth, before 설정: `StaffNavigation` documents 설정 as
 * deliberately outside the main workflow, so it stays last.
 */
export function staffNavItems(
  counts: StaffStationCounts | null,
  extra?: { service?: number | null },
): StaffNavItem[] {
  return [
    {
      label: '테이블',
      to: '/staff/tables',
      count: counts?.tables ?? null,
      attention: true,
    },
    { label: '주방', to: '/staff/kitchen', count: counts?.kitchen ?? null },
    { label: '서빙', to: '/staff/serving', count: counts?.serving ?? null },
    { label: '결제', to: '/staff/payment', count: counts?.payment ?? null },
    /*
     * The 서비스 badge counts staff who still owe, not service orders — it is
     * the number of people the treasurer has left to collect from, which is
     * the only figure that shrinks to zero at the end of the night.
     */
    { label: '서비스', to: '/staff/service', count: extra?.service ?? null },
    { label: '설정', to: '/staff/settings', count: null },
  ]
}
