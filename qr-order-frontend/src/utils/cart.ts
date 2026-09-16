import type { CartLine } from '../types/menu'

/**
 * What the diner owes. No VAT is charged (UX-STRUCTURE §3 S05, decided
 * 2026-08-25) — menu prices are final, so the total is just the sum of the
 * line totals. Any fee introduced later belongs here, and on the cart's
 * breakdown, never on the confirmation screen.
 */
export function calculateCartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
}

/** The catalog no longer has options; one menu is one cart line. */
export function isSameCartLine(a: CartLine,b: CartLine): boolean { return a.itemId === b.itemId }
