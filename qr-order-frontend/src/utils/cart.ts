import type { CartLine, MenuItemDetail } from '../types/menu'

/** VAT rate drawn on the S05 price breakdown ("부가세 (10%)"). */
export const VAT_RATE = 0.1

export interface CartTotals {
  /** Sum of the line totals, before tax. */
  subtotal: number
  vat: number
  /** What the diner actually owes — the figure shown on every sticky bar. */
  total: number
}

export function calculateCartTotals(lines: CartLine[]): CartTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  )
  const vat = Math.round(subtotal * VAT_RATE)
  return { subtotal, vat, total: subtotal + vat }
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
