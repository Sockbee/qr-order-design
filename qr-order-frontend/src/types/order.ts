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
/**
 * A round the staff comped. The diner is billed 0 for it; a staff member
 * carries the cost, which is not the diner's business and is never sent here
 * (apps-script-api-design §4.6).
 */
export type OrderKind = 'GUEST' | 'SERVICE'

export interface PlacedOrder {
  /** Server UUID when this order came from the API. */
  id?: string
  /** Absent on locally-placed orders, which are always GUEST. */
  kind?: OrderKind
  /**
   * Written to the diner by the staff member who comped this round, and shown
   * verbatim. Plain text — never interpreted as HTML or markdown.
   */
  serviceMessage?: string | null
  /** Display name only; the roster id never reaches the diner. */
  chargedStaffName?: string | null
  /** Diner-facing order number, e.g. "A-1042". */
  number: string
  tableNumber: number
  lines: CartLine[]
  total: number
  /** ISO timestamp, kept serializable for the localStorage work to come. */
  placedAt: string
  status: OrderStatus
}
