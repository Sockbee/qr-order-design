import type { CartLine } from './menu'

/**
 * Diner-visible order states (UX-STRUCTURE §5.2, §5.4).
 * The kitchen-side machine is longer; these are the four the diner sees.
 */
export type OrderStatus =
  | 'accepted'
  | 'preparing'
  | 'served'
  | 'closed'
  | 'cancelled'

/**
 * An order the diner has confirmed. Placed orders are no longer cancellable
 * from the diner side (UX-STRUCTURE §5.2).
 */
export interface PlacedOrder {
  /** Server UUID when this order came from the API. */
  id?: string
  /** Diner-facing order number, e.g. "A-1042". */
  number: string
  tableNumber: number
  lines: CartLine[]
  total: number
  /** ISO timestamp, kept serializable for the localStorage work to come. */
  placedAt: string
  status: OrderStatus
}
