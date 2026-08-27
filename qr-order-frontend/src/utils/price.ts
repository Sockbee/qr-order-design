/**
 * Price formatting (UX-STRUCTURE §4.4): thousands separator always present,
 * currency suffix always `원`, never a bare number.
 */
export function formatPrice(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}

/** Option deltas are always signed and always shown, including zero. */
export function formatPriceDelta(amount: number): string {
  const sign = amount < 0 ? '-' : '+'
  return `${sign}${Math.abs(amount).toLocaleString('ko-KR')}원`
}

/**
 * Staff screens draw the amount as `₩42,000` (A01 — Table Home, 90:2), not
 * the customer app's `42,000원`. Figma outranks UX-STRUCTURE §4.4 for what a
 * frame actually draws, and the glyph is narrower — which is what lets the
 * amount sit on one line inside a 198px tile.
 */
export function formatStaffAmount(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`
}
