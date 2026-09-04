/**
 * Staff POS domain types.
 *
 * Figma: page "Staff POS — iPad" (81:132). These are the mapped types the
 * staff pages consume — never backend transport details, which stay behind
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
  /** All four rail badges returned with the table snapshot. */
  stationCounts: StaffStationCounts
}

/** One line of the A02 order list (staff/StaffOrderItem, 87:68). */
export interface StaffOrderItem {
  itemId: string
  name: string
  /** Joined option summary, or `—` when there is none. */
  optionSummary: string
  quantity: number
  amount: number
  /** Cancelled lines stay in the list, struck through — see the component. */
  cancelled: boolean
}

/**
 * staff/OrderNote (87:81). A memo is an operational instruction, so the tag
 * says which team it is addressed to without relying on colour.
 */
export type StaffNoteAudience = 'general' | 'kitchen' | 'serving'

export interface StaffNote {
  noteId: string
  audience: StaffNoteAudience
  text: string
}

export const STAFF_NOTE_LABELS: Record<StaffNoteAudience, string> = {
  general: '메모',
  kitchen: '주방',
  serving: '서빙',
}

/** Money as A02 breaks it down (§4.12 `tables/bill`). */
export interface StaffBill {
  subtotalAmount: number
  discountRate: number
  discountAmount: number
  finalAmount: number
  paid: boolean
}

/** Everything the 420px inspector panel renders for one table. */
export interface StaffTableDetail {
  tableId: string
  displayName: string
  status: StaffOrderStatus | null
  elapsedMinutes: number | null
  bill: StaffBill
  items: StaffOrderItem[]
  notes: StaffNote[]
  /** Present while the table has unacknowledged calls. */
  call: StaffCallGroup | null
  /** Set when this table is part of a merge. */
  mergeLabel: string | null
}

/** One card in the kitchen or serving queue (staff/KitchenOrderCard, 88:68). */
export interface StaffStationOrder {
  orderId: string
  tableId: string
  status: StaffOrderStatus
  elapsedMinutes: number
  items: Array<{ name: string; quantity: number }>
  /** The memo addressed to this station, if any. */
  note: string | null
}

/** One card in the payment queue (staff/PaymentOrderCard). */
export interface StaffPaymentOrder {
  tableId: string
  bill: StaffBill
  /** "서빙 완료 후 12분" — how long the table has been waiting to settle. */
  minutesSinceServed: number | null
  confirming: boolean
}

/** The rail badges, so every staff screen shows the same four numbers. */
export interface StaffStationCounts {
  tables: number
  kitchen: number
  serving: number
  payment: number
}

/**
 * A02/A03 gained a second kind of order (schema §9 "서비스 지급 주문"). The
 * guest pays 0 and a named staff member carries a share of the list price.
 * `GUEST` is the default for every order that predates the column.
 */
export type StaffOrderKind = 'GUEST' | 'SERVICE'

/**
 * One row of the pre-registered 학생회 명단 (schema §19). Nobody outside the
 * roster can be charged, so this list is the entire input domain of the
 * 부담 스태프 picker — there is no free-text fallback.
 */
export interface StaffMember {
  staffId: string
  name: string
  /** Disambiguates 동명이인; also the settlement list's grouping caption. */
  affiliation: string | null
  active: boolean
}

/**
 * What one service order costs its sponsor. Frozen at the moment of the
 * grant (§4.20) — the table's own discount rate never touches it, and the
 * two rates are independent settings.
 */
export interface StaffServiceCharge {
  /** Sum of the ACTIVE line totals, at list price. */
  grossAmount: number
  /** `STAFF_DISCOUNT_RATE`, the share the staff member is let off. */
  discountRate: number
  /** `gross - floor(gross * rate / 100)` — §15's formula, not its inverse. */
  chargeAmount: number
}

/** One granted service order, as the settlement screen lists it. */
export interface StaffSettlementOrder {
  orderId: string
  displayCode: string
  tableId: string
  /** Written to the diner and shown on their device — not an internal note. */
  serviceMessage: string | null
  grossAmount: number
  chargeAmount: number
  createdAt: string
}

/**
 * One staff member's settlement position (§4.21). `chargeAmount` is computed
 * at read time from the un-cancelled service orders; `settledAmount` is the
 * snapshot taken when the money actually changed hands. They differ only
 * when an order was corrected after settlement — which the card calls out.
 */
export interface StaffSettlement {
  staffId: string
  name: string
  affiliation: string | null
  serviceOrderCount: number
  grossAmount: number
  chargeAmount: number
  settled: boolean
  settledAmount: number | null
  settledAt: string | null
  orders: StaffSettlementOrder[]
}
