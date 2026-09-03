import { callStaffApi } from './client'
import type { MenuCategory, MenuItemSummary } from '../../types/menu'

/**
 * The staff menu list and the sold-out switch. Neither action exists in
 * apps-script-api-design.md yet — the customer's `POST /menu` (§4.3) is
 * table-token scoped and read-only, so the staff deployment needs its own.
 * See the PR document.
 */
export interface StaffMenuResponse {
  categories: Array<{ id: string; label: string; heading?: string }>
  items: Array<{
    itemId: string
    categoryId: string
    name: string
    price: number
    soldOut: boolean
  }>
}

export function listStaffMenu(signal?: AbortSignal): Promise<StaffMenuResponse> {
  return callStaffApi<StaffMenuResponse>('menu/list', {}, signal)
}

/**
 * 품절 관리 is not inventory management. It does one thing: stop a dish that
 * has run out from being ordered. One tap flips it and there is no confirm
 * step, because it is trivially reversible (102:1579).
 */
export function setStaffMenuAvailability(
  itemId: string,
  soldOut: boolean,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>('menu/availability', { itemId, soldOut }, signal)
}

export function mapStaffMenu(response: StaffMenuResponse): {
  categories: MenuCategory[]
  items: MenuItemSummary[]
} {
  return {
    categories: response.categories.map((category) => ({
      id: category.id,
      label: category.label,
      heading: category.heading ?? category.label,
    })),
    items: response.items.map((item) => ({
      id: item.itemId,
      categoryId: item.categoryId,
      name: item.name,
      // Staff screens list name and price only; the customer app owns descriptions.
      description: '',
      price: item.price,
      soldOut: item.soldOut,
    })),
  }
}
