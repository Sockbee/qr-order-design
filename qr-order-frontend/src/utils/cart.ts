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

function sortedOptionIds(line: CartLine): string[] {
  return [...(line.selectedOptionIds ?? [])].sort()
}

/**
 * Same item with the same selected options — these merge into one cart line
 * (quantity adds up) instead of appearing as separate rows.
 */
export function isSameCartLine(a: CartLine, b: CartLine): boolean {
  if (a.itemId !== b.itemId) return false
  const optionsA = sortedOptionIds(a)
  const optionsB = sortedOptionIds(b)
  return (
    optionsA.length === optionsB.length &&
    optionsA.every((id, index) => id === optionsB[index])
  )
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
