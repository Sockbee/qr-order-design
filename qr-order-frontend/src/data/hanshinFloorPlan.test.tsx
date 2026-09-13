import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HANSHIN_TABLES } from './hanshinFloorPlan'
import { staffTables } from './staff'
import { TableFloorPlan } from '../components/staff/TableFloorPlan'
import { buildTableHomeData } from '../api/staff/tables'
import { mapRemoteOrders } from '../api/orders'
import type { OrderListResponse } from '../api/orders'
import { OrderStatusPage } from '../pages/OrderStatusPage'

describe('한신포차 배치와 합석 표시', () => {
  it('keeps 24 independent four-seat tables, including the three upper-right tables', () => {
    expect(HANSHIN_TABLES).toHaveLength(24)
    expect(new Set(HANSHIN_TABLES.map((table) => table.tableId)).size).toBe(24)
    expect(HANSHIN_TABLES.every((table) => table.capacity === 4)).toBe(true)
    const corner = ['T19', 'T18', 'T17'].map((id) => HANSHIN_TABLES.find((table) => table.tableId === id)!)
    expect(corner.every((table) => table.x > 750 && table.y < 300)).toBe(true)
    expect(corner.map((table) => table.y)).toEqual([...corner.map((table) => table.y)].sort((a, b) => a - b))
    expect(staffTables).toHaveLength(24)
    expect(staffTables.every((table) => !table.mergeLabel)).toBe(true)
  })

  it('shows missing configured tables as disabled, and preserves extra configured tables', () => {
    const html = renderToStaticMarkup(<TableFloorPlan tables={[staffTables[0], { ...staffTables[1], tableId: 'T25' }]}
      selectedTableIds={['T01']} onSelect={() => {}} />)
    expect(html.match(/data-table-id=/g)).toHaveLength(24)
    expect(html.match(/disabled=""/g)).toHaveLength(23)
    expect(html).toContain('미등록')
    expect(html).toContain('배치도 외 테이블')
    expect(html).toContain('T25')
    expect(html).toContain('aria-pressed="true"')
  })

  it('counts shared pending items once while counting each occupied physical table', () => {
    const tables = staffTables.slice(0, 3).map((table, i) => ({
      ...table, mergeLabel: i < 2 ? 'T01+T02' : null, pendingItemCount: i < 2 ? 5 : 2,
    }))
    const data = buildTableHomeData(tables, [])
    expect(data.activeTableCount).toBe(3)
    expect(data.pendingItemCount).toBe(7)
  })

  it('keeps each order origin and shows the shared group in customer history', () => {
    const response: OrderListResponse = {
      table: { tableId: 'T17', displayName: '테이블 17' }, groupTableIds: ['T17', 'T18'],
      latestPublicStatus: 'accepted', sessionTotalAmount: 3000, activeCall: null,
      orders: [{ orderId: 'second', tableId: 'T18', displayCode: 'A-2', status: 'RECEIVED', publicStatus: 'accepted',
        totalAmount: 1500, createdAt: '2026-09-14T10:00:01Z', items: [{ name: '콜라', quantity: 1, lineTotal: 1500, selectedOptions: [] }] },
      { orderId: 'first', tableId: 'T17', displayCode: 'A-1', status: 'RECEIVED', publicStatus: 'accepted',
        totalAmount: 1500, createdAt: '2026-09-14T10:00:00Z', items: [{ name: '콜라', quantity: 1, lineTotal: 1500, selectedOptions: [] }] }],
    }
    const mapped = mapRemoteOrders(response, 17)
    expect(mapped.map((order) => [order.id, order.tableNumber])).toEqual([['first', 17], ['second', 18]])
    const html = renderToStaticMarkup(<OrderStatusPage orders={mapped} groupTableIds={response.groupTableIds}
      onBack={() => {}} onOrderMore={() => {}} onCallStaff={() => {}} />)
    expect(html).toContain('T17 + T18')
    expect(html).toContain('합석 · 주문내역 공유')
    expect(html).toContain('T18에서 접수')
    expect(html).toContain('3,000')
  })
})
