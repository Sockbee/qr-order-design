import type { MenuSaleRow, SaleType } from '../api/staff/sales'

export const SALE_TYPES: SaleType[] = ['GENERAL', 'MEMBER', 'SERVICE', 'COIN']
export const SALE_LABELS: Record<SaleType, string> = {
  GENERAL: '일반 테이블', MEMBER: '학생회비 납부자', SERVICE: '서비스', COIN: '엽전 주문',
}
export function groupMenuSales(rows: MenuSaleRow[], category = '', search = '', sort: 'quantity' | 'amount' = 'quantity') {
  const groups = new Map<string, { menuId: string; name: string; quantity: number; amount: number; rows: MenuSaleRow[] }>()
  for (const row of rows) {
    if (category && row.categoryId !== category) continue
    if (!row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) continue
    const group = groups.get(row.menuId) ?? { menuId: row.menuId, name: row.name, quantity: 0, amount: 0, rows: [] }
    group.quantity += row.quantity
    group.amount += row.amount
    group.rows.push(row)
    groups.set(row.menuId, group)
  }
  return [...groups.values()].sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name, 'ko'))
}
export function saleBreakdown(rows: MenuSaleRow[], type: SaleType) {
  const selected = rows.filter((row) => row.type === type)
  return {
    receivedCoins: selected.reduce((sum, row) => sum + (row.receivedCoins ?? 0), 0),
    pendingCoins: selected.reduce((sum, row) => sum + (row.pendingCoins ?? 0), 0),
    quantity: selected.reduce((sum, row) => sum + row.quantity, 0),
    amount: selected.reduce((sum, row) => sum + row.amount, 0),
    unpaidQuantity: selected.reduce((sum, row) => sum + row.unpaidQuantity, 0),
    rates: [...new Set(selected.map((row) => row.discountRate))].sort((a, b) => a - b),
  }
}
export const koreaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date)
