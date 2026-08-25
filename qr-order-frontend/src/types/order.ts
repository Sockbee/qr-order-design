import type { CartLine } from './menu'

/**
 * An order the diner has confirmed. Placed orders are no longer cancellable
 * from the diner side (UX-STRUCTURE §5.2).
 */
export interface PlacedOrder {
  /** Diner-facing order number, e.g. "A-1042". */
  number: string
  tableNumber: number
  lines: CartLine[]
  total: number
}
