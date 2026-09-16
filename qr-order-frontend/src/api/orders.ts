import { callApi } from './client'
import type { CartLine } from '../types/menu'
import type { ItemPreparationStatus, OrderKind, OrderStatus, PlacedOrder } from '../types/order'
import type { TableCredentials } from '../types/session'
import { calculateCartTotal } from '../utils/cart'

export interface CreateOrderResponse {
  orderId: string
  displayNumber: number
  displayCode: string
  table: { tableId: string; displayName: string }
  status: string
  publicStatus: OrderStatus
  paymentStatus: string
  paymentMethod?: 'KRW' | 'COIN'
  coinTotal?: number
  coinReceived?: boolean
  totalAmount: number
  createdAt: string
  idempotentReplay: boolean
  items: Array<{
    coinUnitPrice?: number
    preparationStation?: 'KITCHEN' | 'SERVING'
    preparationStatus?: 'PENDING' | 'READY' | 'SERVED'
    status?: string
    lineNo: number
    menuId: string
    name: string
    basePrice: number
    unitPrice: number
    quantity: number
    lineTotal: number

  }>
}

export function createOrder(
  credentials: TableCredentials,
  cart: CartLine[],
  clientRequestId: string,
  signal?: AbortSignal,
  paymentMethod: 'KRW' | 'COIN' = 'KRW',
): Promise<CreateOrderResponse> {
  return callApi<CreateOrderResponse>(
    'orders/create',
    {
      tableId: credentials.tableId,
      tableToken: credentials.tableToken,
      clientRequestId,
      paymentMethod,
      expectedTotalAmount: calculateCartTotal(cart),
      note: '',
      items: cart.map((line) => ({
        menuId: line.itemId,
        quantity: line.quantity,
      })),
    },
    signal,
  )
}

export function mapCreatedOrder(
  response: CreateOrderResponse,
  tableNumber: number,
): PlacedOrder {
  return {
    id: response.orderId,
    number: response.displayCode,
    tableNumber,
    lines: response.items.map((item) => ({
      itemId: item.menuId,
      preparationStatus: mapPreparationStatus(item.preparationStatus),
      cancelled: item.status === 'CANCELLED',
      nameSnapshot: item.name,
      quantity: item.quantity,
      unitPrice: response.paymentMethod === 'COIN' ? (item.coinUnitPrice ?? 0) : item.unitPrice,
      preparationStation: item.preparationStation,
    })),
    paymentMethod: response.paymentMethod, coinTotal: response.coinTotal, coinReceived: response.coinReceived,
    total: response.totalAmount,
    placedAt: response.createdAt,
    status: mapCustomerStatus(response.status, response.publicStatus),
  }
}

export interface OrderListItem {
  tableId?: string
  orderId: string
  displayCode: string
  status: string
  publicStatus: OrderStatus
  paymentMethod?: 'KRW' | 'COIN'
  coinTotal?: number
  coinReceived?: boolean
  totalAmount: number
  /** Absent on rows written before the column existed — read as GUEST. */
  orderKind?: OrderKind
  serviceMessage?: string | null
  chargedStaffName?: string | null
  createdAt: string
  items: Array<{
    preparationStatus?: 'PENDING' | 'READY' | 'SERVED'
    status?: string
    name: string
    coinUnitPrice?: number
    preparationStation?: 'KITCHEN' | 'SERVING'
    quantity: number
    lineTotal: number
  }>
}

export interface OrderListResponse {
  table: { tableId: string; displayName: string }
  orders: OrderListItem[]
  groupTableIds?: string[]
  latestPublicStatus: Exclude<OrderStatus, 'cancelled'> | null
  sessionTotalAmount: number
  activeCall: {
    callId: string
    reason: import('../types/call').CallReason
    createdAt: string
  } | null
}

export function listOrders(
  credentials: TableCredentials,
  signal?: AbortSignal,
): Promise<OrderListResponse> {
  return callApi<OrderListResponse>(
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
      tableNumber: order.tableId ? Number(order.tableId.replace(/^T/, '')) : tableNumber,
      originTableId: order.tableId,
      lines: order.items.map((item, index) => ({
        itemId: `${order.orderId}:${index + 1}`,
        preparationStatus: mapPreparationStatus(item.preparationStatus),
        cancelled: item.status === 'CANCELLED',
        nameSnapshot: item.name,
        quantity: item.quantity,
        unitPrice: order.paymentMethod === 'COIN' ? (item.coinUnitPrice ?? 0) : item.lineTotal / item.quantity,
        preparationStation: item.preparationStation,
      })),
      paymentMethod: order.paymentMethod, coinTotal: order.coinTotal, coinReceived: order.coinReceived,
      total: order.totalAmount,
      placedAt: order.createdAt,
      status: mapCustomerStatus(order.status, order.publicStatus),
      kind: order.orderKind ?? 'GUEST',
      /*
       * Only carried for comped rounds. A GUEST order has no message and no
       * sponsor, and copying empty strings through would make the S08 card
       * render an empty note block.
       */
      serviceMessage:
        order.orderKind === 'SERVICE' ? (order.serviceMessage ?? null) : null,
      chargedStaffName:
        order.orderKind === 'SERVICE' ? (order.chargedStaffName ?? null) : null,
    }))
}

/** Also correct responses from an older server during a rolling deployment. */
function mapCustomerStatus(status: string, fallback: OrderStatus): OrderStatus {
  switch (status) {
    case 'RECEIVED': case 'CONFIRMED': return 'accepted'
    case 'PREPARING': case 'SERVING': return 'preparing'
    case 'COMPLETED': return 'served'
    case 'CANCELLED': return 'cancelled'
    default: return fallback === 'closed' ? 'served' : fallback
  }
}

function mapPreparationStatus(status?: string): ItemPreparationStatus | undefined {
  switch (status) {
    case 'PENDING': return 'pending'
    case 'READY': return 'ready'
    case 'SERVED': return 'served'
    default: return undefined
  }
}
