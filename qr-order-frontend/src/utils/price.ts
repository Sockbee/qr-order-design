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
