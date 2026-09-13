import type { MenuSaleRow } from '../api/staff/sales'
// API-free visual preview only; production never falls back after a request fails.
export const demoMenuSales: MenuSaleRow[] = [
  ['beer', '생맥주 (500cc)', 5000, [35, 5, 2]],
  ['cola', '콜라', 1500, [20, 10, 5]],
  ['kimchi', '김치찌개', 9000, [20, 8, 1]],
  ['soju', '소주', 5000, [12, 8, 5]],
  ['jeyuk', '제육볶음', 13000, [15, 5, 1]],
  ['pajeon', '해물파전', 15000, [10, 8, 0]],
].flatMap((entry) => {
  const [menuId, name, price, quantities] = entry as [string, string, number, number[]]
  const drink = ['beer', 'cola', 'soju'].includes(menuId)
  return quantities.map((quantity, i) => ({
    menuId, name, categoryId: drink ? 'drink' : 'food', categoryLabel: drink ? '음료·주류' : '식사·안주',
    type: (['GENERAL', 'MEMBER', 'SERVICE'] as const)[i], discountRate: i === 0 ? 0 : 20,
    quantity, amount: quantity * price * (i === 0 ? 1 : 0.8), unpaidQuantity: 0,
  }))
})
