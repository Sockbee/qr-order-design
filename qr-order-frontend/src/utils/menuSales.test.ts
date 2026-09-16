import { describe, expect, it } from 'vitest'
import { groupMenuSales, saleBreakdown, koreaDate } from './menuSales'
import type { MenuSaleRow } from '../api/staff/sales'

const row = (type: MenuSaleRow['type'], quantity: number, amount: number, rate = 0): MenuSaleRow => ({
  menuId: 'soju', name: '소주', categoryId: 'drink', categoryLabel: '음료', type,
  quantity, amount, discountRate: rate, unpaidQuantity: type === 'GENERAL' ? quantity : 0,
})
describe('menu sales', () => {
  it('moves unpaid general orders after payment without duplicating quantity or service', () => {
    const before = [row('GENERAL', 20, 100000), row('SERVICE', 5, 20000, 20)]
    const after = [row('GENERAL', 12, 60000), row('MEMBER', 8, 32000, 20), row('SERVICE', 5, 20000, 20)]
    expect(groupMenuSales(before)[0]).toMatchObject({ quantity: 25, amount: 120000 })
    expect(groupMenuSales(after)[0]).toMatchObject({ quantity: 25, amount: 112000 })
    expect(saleBreakdown(after, 'MEMBER')).toMatchObject({ quantity: 8, amount: 32000, rates: [20] })
    expect(saleBreakdown(before, 'MEMBER')).toMatchObject({ quantity: 0, amount: 0, rates: [] })
  })
  it('keeps mixed historical service rates while filtering and sorting menu totals', () => {
    const rows = [row('SERVICE', 1, 4000, 20), row('SERVICE', 1, 3500, 30),
      { ...row('GENERAL', 1, 9000), menuId: 'food', name: '안주', categoryId: 'food' }]
    expect(saleBreakdown(rows, 'SERVICE')).toMatchObject({ amount: 7500, quantity: 2, rates: [20, 30] })
    expect(groupMenuSales(rows, '', '', 'amount')[0].menuId).toBe('food')
    expect(groupMenuSales(rows, 'drink', ' 소주 ')[0].amount).toBe(7500)
    expect(groupMenuSales(rows, '', '없는 메뉴')).toEqual([])
  })
  it('uses the Korean date across midnight', () => {
    expect(koreaDate(new Date('2026-09-13T15:00:00Z'))).toBe('2026-09-14')
  })
})

it('counts coin units separately while keeping all sold quantities', () => {
  const rows = [row('GENERAL', 2, 9000), { ...row('COIN', 3, 0), receivedCoins: 18, pendingCoins: 9 }]
  expect(groupMenuSales(rows)[0]).toMatchObject({ quantity: 5, amount: 9000 })
  expect(saleBreakdown(rows, 'COIN')).toMatchObject({ quantity: 3, amount: 0, receivedCoins: 18, pendingCoins: 9 })
})
