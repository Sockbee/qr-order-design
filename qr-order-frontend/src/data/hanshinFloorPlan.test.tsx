import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HANSHIN_TABLES, HANSHIN_WINDOW_TABLES, getHanshinFloorPlan, FLOOR_WIDTH, FLOOR_HEIGHT } from './hanshinFloorPlan'
import { staffTables } from './staff'
import { TableFloorPlan } from '../components/staff/TableFloorPlan'
import { buildTableHomeData } from '../api/staff/tables'
import { mapRemoteOrders } from '../api/orders'
import type { OrderListResponse } from '../api/orders'
import { OrderStatusPage } from '../pages/OrderStatusPage'

describe('한신포차 배치와 합석 표시', () => {
  it('matches the numbered drawing with 23 independent four-seat tables', () => {
    expect(HANSHIN_TABLES.map((table) => table.tableId)).toEqual(
      Array.from({ length: 23 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`),
    )
    expect(HANSHIN_TABLES.every((table) => table.capacity === 4)).toBe(true)
    const byId = (id: string) => HANSHIN_WINDOW_TABLES.find((table) => table.tableId === id)!
    for (const ids of [['T03', 'T04', 'T05', 'T06'], ['T07', 'T08', 'T09', 'T10'], ['T11', 'T12', 'T13', 'T14']]) {
      const column = ids.map(byId)
      expect(new Set(column.map((table) => table.x)).size).toBe(1)
      expect(column.map((table) => table.y)).toEqual([...column.map((table) => table.y)].sort((a, b) => a - b))
      expect(column.map((table) => table.shape)).toEqual(['rect', 'round', 'round', 'rect'])
    }
    expect(['T15', 'T16', 'T17'].map((id) => byId(id).shape)).toEqual(['diamond', 'diamond', 'diamond'])
    expect(byId('T01').x).toBeLessThan(byId('T03').x)
    expect(byId('T01').y).toBeLessThan(byId('T02').y)
    expect(['T19', 'T20', 'T21', 'T22', 'T23'].every((id) => byId(id).x > byId('T18').x)).toBe(true)
    expect(staffTables).toHaveLength(23)
    expect(staffTables.every((table) => !table.mergeLabel)).toBe(true)
  })

  it('rotates all positions by 180 degrees without changing IDs, shape or capacity', () => {
    const windowView = getHanshinFloorPlan('window')
    const posView = getHanshinFloorPlan('pos')
    const original = [...windowView.tables, ...windowView.landmarks, windowView.event]
    const rotated = [...posView.tables, ...posView.landmarks, posView.event]
    original.forEach((position, index) => {
      expect(rotated[index]).toEqual({ ...position, x: FLOOR_WIDTH - position.x, y: FLOOR_HEIGHT - position.y })
    })
    expect(windowView.event.y).toBeLessThan(windowView.tables[0].y)
  })

  it('shows missing configured tables as disabled, and preserves extra configured tables', () => {
    const html = renderToStaticMarkup(<TableFloorPlan tables={[staffTables[0], { ...staffTables[1], tableId: 'T25' }]}
      selectedTableIds={['T01']} onSelect={() => {}} />)
    expect(html.match(/data-table-id=/g)).toHaveLength(23)
    expect(html.match(/disabled=""/g)).toHaveLength(22)
    expect(html).toContain('미등록')
    expect(html).toContain('배치도 외 테이블')
    expect(html).toContain('T25')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('이벤트 공간 · 주문 테이블 아님')
    expect(html).toContain('창문 쪽에서 보기')
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
        totalAmount: 1500, createdAt: '2026-09-14T10:00:01Z', items: [{ name: '콜라', quantity: 1, lineTotal: 1500, }] },
      { orderId: 'first', tableId: 'T17', displayCode: 'A-1', status: 'RECEIVED', publicStatus: 'accepted',
        totalAmount: 1500, createdAt: '2026-09-14T10:00:00Z', items: [{ name: '콜라', quantity: 1, lineTotal: 1500, }] }],
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
