import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { itemProgress, overallOrderStatus } from './order'
import { StatusTracker } from '../components/StatusTracker'
import { OrderStatusPage } from '../pages/OrderStatusPage'
import { mapRemoteOrders, mapCreatedOrder } from '../api/orders'
import type { CreateOrderResponse, OrderListResponse } from '../api/orders'
import type { OrderStatus, PlacedOrder, ItemPreparationStatus } from '../types/order'

function order(status: OrderStatus, states: ItemPreparationStatus[]): PlacedOrder {
  return { number: 'A-1', tableNumber: 17, total: 3000, placedAt: '2026-09-14T12:00:00Z', status,
    lines: states.map((preparationStatus, i) => ({ itemId: String(i), nameSnapshot: `메뉴 ${i}`, quantity: 1, unitPrice: 1500, preparationStatus })) }
}

describe('고객 메뉴별 조리·서빙 상태', () => {
  it('keeps ready menus preparing until POS confirms serving', () => {
    const mixed = order('preparing', ['pending', 'ready', 'served'])
    expect(mixed.lines.map((line) => itemProgress(line, mixed.status))).toEqual(['preparing', 'preparing', 'served'])
    expect(itemProgress(mixed.lines[2], 'cancelled')).toBe('cancelled')
  })
  it('summarises all active rounds, including older unserved menus', () => {
    expect(overallOrderStatus([order('accepted', ['pending'])])).toBe('accepted')
    expect(overallOrderStatus([order('preparing', ['ready']), order('served', ['served'])])).toBe('preparing')
    expect(overallOrderStatus([order('served', ['served']), order('cancelled', ['pending'])])).toBe('served')
    expect(overallOrderStatus([order('cancelled', ['pending'])])).toBe('accepted')
  })
  it('renders three steps with serving as the terminal step, including legacy closed orders', () => {
    for (const status of ['served', 'closed'] as const) {
      const html = renderToStaticMarkup(<StatusTracker status={status} />)
      expect(html.match(/<li /g)).toHaveLength(3)
      expect(html).toContain('aria-current="step"')
      expect(html).not.toContain('animate-pulse-ring')
      expect(html).not.toContain('>완료<')
    }
  })
  it('renders a status for each menu and preserves free service prices', () => {
    const html = renderToStaticMarkup(<OrderStatusPage
      orders={[{ ...order('preparing', ['ready', 'served']), kind: 'SERVICE' }]}
      onBack={() => {}} onOrderMore={() => {}} onCallStaff={() => {}} />)
    expect(html).toContain('메뉴 0')
    expect(html).toContain('메뉴 1')
    expect(html.match(/서빙 완료/g)).toHaveLength(2) // tracker + served menu
    expect(html.match(/>0원</g)).toHaveLength(2)
    expect(html).not.toContain('>완료<')
  })
  it('maps item readiness for both listing and create/replay responses, correcting old public status values', () => {
    const response: OrderListResponse = { table: { tableId: 'T17', displayName: '17' },
      latestPublicStatus: 'served', sessionTotalAmount: 1500, activeCall: null,
      orders: [{ orderId: 'id', displayCode: 'A-1', status: 'SERVING', publicStatus: 'served',
        totalAmount: 1500, createdAt: '2026-09-14T12:00:00Z', items: [{ name: '콜라', quantity: 1, lineTotal: 1500, preparationStatus: 'READY' }] }] }
    const mapped = mapRemoteOrders(response, 17)[0]
    expect(mapped.status).toBe('preparing')
    expect(mapped.lines[0].preparationStatus).toBe('ready')
    const created: CreateOrderResponse = { orderId: 'id', displayNumber: 1, displayCode: 'A-1', table: response.table,
      status: 'COMPLETED', publicStatus: 'closed', paymentStatus: 'UNPAID', totalAmount: 1500,
      createdAt: '2026-09-14T12:00:00Z', idempotentReplay: true,
      items: [{ lineNo: 1, menuId: 'cola', name: '콜라', basePrice: 1500, unitPrice: 1500, quantity: 1,
        lineTotal: 1500, preparationStatus: 'SERVED' }] }
    expect(mapCreatedOrder(created, 17).status).toBe('served')
    expect(mapCreatedOrder(created, 17).lines[0].preparationStatus).toBe('served')
  })
})
