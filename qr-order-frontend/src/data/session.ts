import type { TableSession } from '../types/session'

/** Fallback session for API-free UI development. Values match the S01 Figma frame. */
export const tableSession: TableSession = {
  token: 'demo-t7',
  storeName: '소프트 일일호프',
  open: true,
  tableNumber: 7,
  notice: '결제는 식사 후 카운터에서 진행해 주세요.',
}
