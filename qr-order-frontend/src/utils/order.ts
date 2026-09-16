import type { OrderStatus, PlacedOrder, PlacedOrderLine } from '../types/order'

/** "오후 7:24" — the round timestamp shown on S08. */
export function formatOrderTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function itemProgress(line: PlacedOrderLine, orderStatus: OrderStatus): 'accepted' | 'preparing' | 'served' | 'cancelled' {
  if (line.cancelled || orderStatus === 'cancelled') return 'cancelled'
  if (line.preparationStation === 'SERVING' && line.preparationStatus !== 'served') return 'accepted'
  if (line.preparationStatus) return line.preparationStatus === 'served' ? 'served' : 'preparing'
  return orderStatus === 'served' || orderStatus === 'closed' ? 'served' : 'preparing'
}

/** Completed newer rounds must not hide older menus still awaiting serving. */
export function overallOrderStatus(orders: PlacedOrder[]): 'accepted' | 'preparing' | 'served' {
  const active = orders.filter((order) => order.status !== 'cancelled')
  if (active.length === 0) return 'accepted'
  if (active.every((order) => {
    const lines = order.lines.filter((line) => !line.cancelled)
    return lines.length > 0
      ? lines.every((line) => itemProgress(line, order.status) === 'served')
      : order.status === 'served' || order.status === 'closed'
  })) return 'served'
  if (active.every((order) => order.status === 'accepted' &&
    order.lines.every((line) => !line.preparationStatus || line.preparationStatus === 'pending' || line.preparationStation === 'SERVING'))) return 'accepted'
  return 'preparing'
}
