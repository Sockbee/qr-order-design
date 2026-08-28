import { callStaffApi } from './client'

/**
 * Table operations. Unlike `tables/list` and `tables/detail`, every action
 * here is already specified in apps-script-api-design.md §4.13–§4.17.
 */

/**
 * §4.13. `discountRate` is `0` or the configured `TABLE_DISCOUNT_RATE` only —
 * this is not a coupon engine. Orders added *after* the discount are covered
 * too, because the amount is computed at read time.
 */
export function applyTableDiscount(
  tableId: string,
  discountRate: number,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'tables/discount',
    { tableId, discountRate },
    signal,
  )
}

/**
 * §4.14. Only the session's table changes; the orders keep their original
 * table so a diner returning to the old QR is still found.
 * An occupied destination is rejected as `DESTINATION_OCCUPIED` — that is a
 * merge, and the operator has to say which they meant.
 */
export function moveTable(
  fromTableId: string,
  toTableId: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>('tables/move', { fromTableId, toTableId }, signal)
}

/**
 * §4.15. One level only — merging into an already-merged table is rejected
 * as `MERGE_CHAIN_NOT_ALLOWED`. The primary session's discount applies to the
 * whole group, and the secondary's comes back when it is split off.
 */
export function mergeTables(
  primaryTableId: string,
  secondaryTableId: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'tables/merge',
    { primaryTableId, secondaryTableId },
    signal,
  )
}

/** §4.16. Each table takes its own orders and amount back. No per-head split. */
export function splitTable(
  tableId: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>('tables/split', { tableId }, signal)
}

/**
 * §4.17. `expectedFinalAmount` is mandatory: if an order lands while the
 * operator is reading the dialog, the server rejects with
 * `BILL_AMOUNT_CHANGED` rather than letting them confirm an amount they never
 * saw. The app records that a bank transfer was seen — it processes no payment.
 */
export function confirmTablePayment(
  tableId: string,
  expectedFinalAmount: number,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'tables/confirm-payment',
    { tableId, expectedFinalAmount },
    signal,
  )
}
