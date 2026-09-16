import { callStaffApi } from './client'

/**
 * Table operations through the Spring Boot staff API.
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
 * §4.17. `expectedSessionId` binds the action to the visit on screen,
 * `clientRequestId` makes response-loss retries idempotent, and
 * `expectedFinalAmount` rejects a bill changed while the operator was reading.
 * The app records that a bank transfer was seen — it processes no payment.
 */
export function confirmTablePayment(
  tableId: string,
  expectedSessionId: string,
  clientRequestId: string,
  expectedFinalAmount: number,
  payerName: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'tables/confirm-payment',
    { tableId, expectedSessionId, clientRequestId, expectedFinalAmount, payerName },
    signal,
  )
}

/** §4.18. Item snapshots stay in place; only quantity and lifecycle fields change. */
export function updateStaffOrderItemQuantity(
  itemId: string,
  quantity: number,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'orders/update',
    { operation: 'quantity', itemId, quantity },
    signal,
  )
}

/** §4.18. Cancelling a line preserves it as a struck-through audit record. */
export function cancelStaffOrderItem(
  itemId: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'orders/update',
    { operation: 'cancel-item', itemId },
    signal,
  )
}

/** A visit-scoped general memo. An empty string deletes it. */
export function saveStaffTableNote(
  tableId: string,
  note: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>('tables/note', { tableId, note }, signal)
}

/** Ends exactly the visit shown to the operator; stale retries are harmless. */
export function resetStaffTable(
  tableId: string,
  expectedSessionId: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'tables/reset',
    { tableId, expectedSessionId },
    signal,
  )
}

/** §4.19. Cancels every unpaid order in the table's current billing group. */
export function cancelStaffTableOrders(
  tableId: string,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>('orders/cancel', { tableId }, signal)
}

export const checkInTable = (tableId: string, expectedSessionId: string | null, departureAt: string | null): Promise<void> =>
  callStaffApi<void>('tables/check-in', { tableId, expectedSessionId, departureAt })
