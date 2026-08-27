/**
 * Staff POS domain types.
 *
 * Figma: page "Staff POS — iPad" (81:132). These are the mapped types the
 * staff pages consume — never the Apps Script field names, which stay behind
 * `src/api/staff/`.
 */

import type { CallReason } from './call'

/**
 * The six shared order steps drawn on A00 "Status semantics" (98:1429).
 * Steps 1–4 are Orders.status, 5–6 are payment_status.
 */
export type StaffOrderStatus =
  | 'new'
  | 'cooking'
  | 'ready'
  | 'served'
  | 'unpaid'
  | 'paid'

export const STAFF_ORDER_STATUS_LABELS: Record<StaffOrderStatus, string> = {
  new: '주문 접수',
  cooking: '조리 중',
  ready: '서빙 대기',
  served: '서빙 완료',
  unpaid: '결제 대기',
  paid: '결제 완료',
}

/**
 * Elapsed time is the priority signal — it replaces manual sorting
 * (staff/ElapsedTimeIndicator, 82:27). Only the late rows escalate; the
 * screen never goes into a full alarm state.
 */
export type StaffElapsedLevel = 'normal' | 'warning' | 'delayed'

/**
 * One tile in the A01 grid. `hasCall` is deliberately a boolean rather than a
 * fifth state: a call can land on any status, so folding it into the state
 * enum would break the combinations (staff/TableCard, 87:45).
 */
export interface StaffTableSummary {
  tableId: string
  displayName: string
  /** False renders the Empty tile — no status, no amount, no meta. */
  occupied: boolean
  status: StaffOrderStatus | null
  amount: number
  /** Minutes since the session opened. Null while the table is empty. */
  elapsedMinutes: number | null
  pendingItemCount: number
  paid: boolean
  hasCall: boolean
  /** Set when this table is part of a merge; renders the 합석 chip. */
  mergeLabel: string | null
  /** Set when a discount is applied; renders the 할인 badge. */
  discountLabel: string | null
}

/**
 * A table's unacknowledged calls, merged into one row (apps-script-api-design
 * §4.10). Never the raw rows: staff/CallRow (106:124) merges by table, dates
 * the group from its oldest call, and concatenates the reasons.
 */
export interface StaffCallGroup {
  tableId: string
  displayName: string
  count: number
  reasons: CallReason[]
  firstCalledAt: string
  lastCalledAt: string
  callIds: string[]
  /** True only for the local post-acknowledge row, never from the server. */
  acknowledged?: boolean
}

/** Everything A01 renders, in one snapshot. */
export interface StaffTableHomeData {
  tables: StaffTableSummary[]
  callGroups: StaffCallGroup[]
  /** Tables that called, not calls raised — the rail and header both use it. */
  callingTableCount: number
  activeTableCount: number
  pendingItemCount: number
  delayedTableCount: number
}
