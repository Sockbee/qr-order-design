/**
 * 직원 호출 (S09 / S09b).
 *
 * A call is not part of the order lifecycle — it happens with or without an
 * order, and one table raises several per sitting. See architecture.md
 * Decision A6; the staff side merges a table's pending calls into one row.
 */

/** Matches the Calls sheet `reason` enum (google-sheets-schema.md §14). */
export type CallReason =
  | 'WATER_UTENSIL'
  | 'SIDE_PLATE'
  | 'ORDER_INQUIRY'
  | 'PAYMENT_REQUEST'
  | 'OTHER'

export interface CallReasonOption {
  reason: CallReason
  label: string
}

/**
 * Picking a reason is optional — it only helps staff decide who walks over.
 * Calling with nothing selected sends `OTHER`.
 */
export const CALL_REASON_OPTIONS: CallReasonOption[] = [
  { reason: 'WATER_UTENSIL', label: '물 · 수저' },
  { reason: 'SIDE_PLATE', label: '앞접시' },
  { reason: 'ORDER_INQUIRY', label: '주문 문의' },
  { reason: 'PAYMENT_REQUEST', label: '결제 요청' },
]

export function callReasonLabel(reason: CallReason): string {
  return (
    CALL_REASON_OPTIONS.find((option) => option.reason === reason)?.label ??
    '직원 호출'
  )
}

/** A call this device raised and staff has not resolved yet. */
export interface ActiveCall {
  callId: string
  reason: CallReason
  /** ISO timestamp, kept serializable for localStorage. */
  createdAt: string
}
