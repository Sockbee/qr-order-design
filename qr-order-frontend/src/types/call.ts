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
 * Every reason's label, including ones no longer offered in the picker
 * (`ORDER_INQUIRY`, `PAYMENT_REQUEST`) — staff still need to read those on
 * calls raised before the picker was trimmed down.
 */
const CALL_REASON_LABELS: Record<CallReason, string> = {
  WATER_UTENSIL: '물 · 수저',
  SIDE_PLATE: '앞접시',
  ORDER_INQUIRY: '주문 문의',
  PAYMENT_REQUEST: '결제 요청',
  OTHER: '기타',
}

/**
 * Picking a reason is optional — it only helps staff decide who walks over.
 * Calling with nothing selected sends `OTHER`, same as explicitly picking 기타.
 */
export const CALL_REASON_OPTIONS: CallReasonOption[] = [
  { reason: 'WATER_UTENSIL', label: CALL_REASON_LABELS.WATER_UTENSIL },
  { reason: 'SIDE_PLATE', label: CALL_REASON_LABELS.SIDE_PLATE },
  { reason: 'OTHER', label: CALL_REASON_LABELS.OTHER },
]

export function callReasonLabel(reason: CallReason): string {
  return CALL_REASON_LABELS[reason] ?? '직원 호출'
}

/** A call this device raised and staff has not resolved yet. */
export interface ActiveCall {
  callId: string
  reason: CallReason
  /** ISO timestamp, kept serializable for localStorage. */
  createdAt: string
}
