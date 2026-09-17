import type { StaffStationOrder } from '../types/staff'
import type { PreparationAction } from '../api/staff/stations'

export const stationCardId = (order: StaffStationOrder) => order.cardId ?? `${order.orderId}:${order.status}`
export const preparationUnitIds = (order: StaffStationOrder) => order.items.flatMap((item) => item.unitIds ?? [item.itemId])

export function demoKitchenUnits(orders: StaffStationOrder[]): StaffStationOrder[] {
  return orders.map((order) => ({
    ...order, cardId: stationCardId(order),
    items: order.items.flatMap((item) => Array.from({ length: item.quantity }, (_, index) => {
      const id = `${order.orderId}:${item.itemId}:${index + 1}`
      return { ...item, itemId: id, unitIds: [id], unitNumber: index + 1, quantity: 1,
        preparationStatus: order.status === 'cooking' ? 'cooking' as const : 'pending' as const }
    })),
  }))
}

/** The demo uses the same independent units and immutable serving batches as the API. */
export function transitionDemoQueues(
  queues: { kitchen: StaffStationOrder[]; serving: StaffStationOrder[] },
  card: StaffStationOrder, unitIds: string[], action: PreparationAction, batchId: string,
) {
  const ids = new Set(unitIds)
  const selected = card.items.filter((item) => (item.unitIds ?? [item.itemId]).every((id) => ids.has(id)))
  if (!selected.length) return queues
  const source = action === 'SERVE' ? 'serving' : 'kitchen'
  const result = { kitchen: [...queues.kitchen], serving: [...queues.serving] }
  result[source] = result[source].flatMap((order) => {
    if (stationCardId(order) !== stationCardId(card)) return [order]
    const items = order.items.filter((item) => !selected.includes(item))
    return items.length ? [{ ...order, items }] : []
  })
  if (action === 'START') {
    const target = result.kitchen.find((order) => order.orderId === card.orderId && order.status === 'cooking')
    const items = selected.map((item) => ({ ...item, preparationStatus: 'cooking' as const }))
    if (target) result.kitchen = result.kitchen.map((order) => order === target ? { ...order, items: [...order.items, ...items] } : order)
    else result.kitchen.push({ ...card, cardId: `${card.orderId}:cooking`, status: 'cooking', items })
  } else if (action === 'COMPLETE') {
    result.serving.push({ ...card, cardId: batchId, status: 'ready', elapsedMinutes: 0,
      items: selected.map((item) => ({ ...item, preparationStatus: 'ready' as const })) })
  }
  result.serving = result.serving.map((order) => ({ ...order, remainingKitchenItemCount:
    result.kitchen.filter((kitchen) => kitchen.orderId === order.orderId).reduce((sum, kitchen) => sum + kitchen.items.length, 0) }))
  return result
}
