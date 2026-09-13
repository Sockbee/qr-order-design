/** Figma 349:2298. Counter → entrance view; physical tables stay independent. */
export type TableShape = 'rect' | 'round' | 'diamond'

export interface TablePosition {
  tableId: string
  x: number
  y: number
  width: number
  height: number
  shape: TableShape
  capacity: number
}

const drawing: Array<[number, number, number, TableShape]> = [
  [1, 295, 65, 'rect'], [2, 465, 65, 'rect'], [3, 635, 65, 'rect'],
  [4, 295, 240, 'round'], [5, 465, 240, 'round'], [6, 635, 240, 'round'],
  [7, 295, 365, 'round'], [8, 465, 365, 'round'], [9, 635, 365, 'round'],
  [10, 295, 505, 'round'], [11, 465, 505, 'round'], [12, 635, 505, 'round'],
  [13, 790, 505, 'round'],
  [14, 790, 145, 'diamond'], [15, 790, 270, 'diamond'], [16, 790, 390, 'diamond'],
  [17, 110, 305, 'rect'], [18, 110, 400, 'rect'], [19, 110, 495, 'rect'],
  [20, 940, 65, 'rect'], [21, 940, 150, 'rect'], [22, 940, 235, 'rect'],
  [23, 940, 405, 'rect'], [24, 940, 495, 'rect'],
]

export const HANSHIN_TABLES: TablePosition[] = drawing.map(([n, x, y, shape]) => ({
  tableId: `T${String(n).padStart(2, '0')}`,
  x: 1000 - x,
  y: 600 - y,
  width: shape === 'rect' ? (n <= 3 ? 76 : 92) : 104,
  height: shape === 'rect' ? (n <= 3 ? 92 : 76) : 104,
  shape,
  capacity: 4,
}))

export const HANSHIN_LANDMARKS = [
  { label: '냉장고 · 주류', x: 810, y: 568, width: 190 },
  { label: '카운터', x: 820, y: 473, width: 180 },
  { label: '입구', x: 850, y: 8, width: 150 },
  { label: '창가', x: 110, y: 5, width: 560 },
]
