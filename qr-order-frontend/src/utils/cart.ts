import type { CartLine, MenuItemDetail } from '../types/menu'

/**
 * What the diner owes. No VAT is charged (UX-STRUCTURE §3 S05, decided
 * 2026-08-25) — menu prices are final, so the total is just the sum of the
 * line totals. Any fee introduced later belongs here, and on the cart's
 * breakdown, never on the confirmation screen.
 */
export function calculateCartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
}

/**
 * "보통 · 공기밥 추가" — the selected options of a line, in group order.
 * Returns an empty string when the item has no options selected.
 */
export function describeCartLineOptions(
  item: MenuItemDetail,
  line: CartLine,
): string {
  const selected = line.selectedOptionIds ?? []
  if (selected.length === 0) return ''

  return item.optionGroups
    .flatMap((group) => group.options)
    .filter((option) => selected.includes(option.id))
    .map((option) => option.label)
    .join(' · ')
}
