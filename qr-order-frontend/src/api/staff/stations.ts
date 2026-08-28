import { callStaffApi } from './client'
import type {
  StaffOrderStatus,
  StaffPaymentOrder,
  StaffStationCounts,
  StaffStationOrder,
} from '../../types/staff'

/**
 * B01–B03 queues. `orders/queue` is another action this frontend specifies
 * rather than finds in apps-script-api-design.md — see the PR document.
 *
 * All three stations come back in one response so the navigation rail can
 * show the same four counts on every screen without three extra polls.
 */
export interface StaffQueueResponse {
  kitchen: Array<{
    orderId: string
    tableId: string
    status: 'RECEIVED' | 'COOKING'
    createdAt: string
    items: Array<{ name: string; quantity: number }>
    kitchenNote: string | null
  }>
  serving: Array<{
    orderId: string
    tableId: string
    readyAt: string
    items: Array<{ name: string; quantity: number }>
    servingNote: string | null
  }>
  payment: Array<{
    tableId: string
    subtotalAmount: number
    discountRate: number
    discountAmount: number
    finalAmount: number
    paymentStatus: 'UNPAID' | 'PAID'
    servedAt: string | null
  }>
  counts: StaffStationCounts
}

export function getStaffQueues(
  signal?: AbortSignal,
): Promise<StaffQueueResponse> {
  return callStaffApi<StaffQueueResponse>('orders/queue', {}, signal)
}

/**
 * The station transitions. Same action as the A02 dropdown, addressed by
 * order rather than by table: the kitchen advances one ticket, the table
 * control advances the whole table.
 */
export function advanceStaffOrder(
  orderId: string,
  status: StaffOrderStatus,
  signal?: AbortSignal,
): Promise<void> {
  const remote = {
    new: 'RECEIVED',
    cooking: 'COOKING',
    ready: 'READY',
    served: 'SERVED',
    unpaid: 'UNPAID',
    paid: 'PAID',
  }[status]
  return callStaffApi<void>('orders/status', { orderId, status: remote }, signal)
}

function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.floor((now - parsed) / 60_000))
}

export function mapKitchenQueue(
  response: StaffQueueResponse,
  now: number = Date.now(),
): StaffStationOrder[] {
  return response.kitchen.map((order) => ({
    orderId: order.orderId,
    tableId: order.tableId,
    status: order.status === 'COOKING' ? 'cooking' : 'new',
    elapsedMinutes: minutesSince(order.createdAt, now) ?? 0,
    items: order.items,
    note: order.kitchenNote,
  }))
}

export function mapServingQueue(
  response: StaffQueueResponse,
  now: number = Date.now(),
): StaffStationOrder[] {
  return response.serving.map((order) => ({
    orderId: order.orderId,
    tableId: order.tableId,
    status: 'ready',
    elapsedMinutes: minutesSince(order.readyAt, now) ?? 0,
    items: order.items,
    note: order.servingNote,
  }))
}

export function mapPaymentQueue(
  response: StaffQueueResponse,
  now: number = Date.now(),
): StaffPaymentOrder[] {
  return response.payment.map((row) => ({
    tableId: row.tableId,
    bill: {
      subtotalAmount: row.subtotalAmount,
      discountRate: row.discountRate,
      discountAmount: row.discountAmount,
      finalAmount: row.finalAmount,
      paid: row.paymentStatus === 'PAID',
    },
    minutesSinceServed: minutesSince(row.servedAt, now),
    confirming: false,
  }))
}
