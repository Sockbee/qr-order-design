import { callAppsScript } from './client'
import type { OrderStatus, PlacedOrder } from '../types/order'
import type { TableCredentials } from '../types/session'

export interface OrderListItem {
  orderId: string
  displayCode: string
  status: string
  publicStatus: OrderStatus
  totalAmount: number
  createdAt: string
  items: Array<{
    name: string
    quantity: number
    lineTotal: number
    selectedOptions: string[]
  }>
}

export interface OrderListResponse {
  table: { tableId: string; displayName: string }
  orders: OrderListItem[]
  latestPublicStatus: Exclude<OrderStatus, 'cancelled'> | null
  sessionTotalAmount: number
}

export function listOrders(
  credentials: TableCredentials,
  signal?: AbortSignal,
): Promise<OrderListResponse> {
  return callAppsScript<OrderListResponse>(
    'orders/list',
    {
      tableId: credentials.tableId,
      tableToken: credentials.tableToken,
    },
    signal,
  )
}

export function mapRemoteOrders(
  response: OrderListResponse,
  tableNumber: number,
): PlacedOrder[] {
  return response.orders
    .slice()
    .reverse()
    .map((order) => ({
      id: order.orderId,
      number: order.displayCode,
      tableNumber,
      lines: order.items.map((item, index) => ({
        itemId: `${order.orderId}:${index + 1}`,
        nameSnapshot: item.name,
        quantity: item.quantity,
        unitPrice: item.lineTotal / item.quantity,
        selectedOptionNames: item.selectedOptions,
      })),
      total: order.totalAmount,
      placedAt: order.createdAt,
      status: order.publicStatus,
    }))
}
