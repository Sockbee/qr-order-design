import { callStaffApi } from './client'

export type SaleType = 'GENERAL' | 'MEMBER' | 'SERVICE'
export interface MenuSaleRow {
  menuId: string
  name: string
  categoryId: string
  categoryLabel: string
  type: SaleType
  discountRate: number
  quantity: number
  amount: number
  unpaidQuantity: number
}
export interface MenuSalesReport { startDate: string; endDate: string; timeZone: string; rows: MenuSaleRow[] }
export const getMenuSales = (startDate: string, endDate: string, signal?: AbortSignal) =>
  callStaffApi<MenuSalesReport>('sales/menu', { startDate, endDate }, signal)
