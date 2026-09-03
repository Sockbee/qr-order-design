import { StaffAvailabilityPage } from './StaffAvailabilityPage'
import { useStaffMenu } from '../../hooks/useStaffMenu'

/**
 * 품절 관리. The catalog source is the same `useStaffMenu` A10 uses, so the
 * two screens cannot disagree about what is sold out.
 */
export function StaffAvailabilityRoute() {
  const menu = useStaffMenu()

  return (
    <StaffAvailabilityPage
      items={menu.items}
      loading={menu.loading}
      togglingItemId={menu.toggling}
      onSetSoldOut={menu.setSoldOut}
    />
  )
}
