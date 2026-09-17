/** Coordinates from the September 17 seating drawing, viewed from the window. */
export type TableShape = 'rect' | 'round' | 'diamond'
export type FloorPlanView = 'pos' | 'window'
export const FLOOR_WIDTH = 1000
export const FLOOR_HEIGHT = 640

interface MapPosition {
  x: number
  y: number
  width: number
  height: number
}

export interface TablePosition extends MapPosition {
  tableId: string
  shape: TableShape
  capacity: number
}

const drawing: Array<[number, number, number, TableShape]> = [
  [1, 70, 570, 'round'], [2, 170, 475, 'round'],
  [3, 325, 535, 'rect'], [4, 440, 535, 'rect'], [5, 555, 535, 'rect'],
  [6, 685, 535, 'round'], [7, 815, 535, 'round'],
  [8, 325, 385, 'round'], [9, 495, 385, 'round'], [10, 665, 385, 'round'],
  [11, 815, 385, 'diamond'],
  [12, 325, 260, 'round'], [13, 495, 260, 'round'], [14, 665, 260, 'round'],
  [15, 815, 260, 'diamond'],
  [16, 325, 100, 'rect'], [17, 495, 100, 'rect'], [18, 685, 100, 'rect'],
  [19, 940, 90, 'rect'], [20, 940, 178, 'rect'], [21, 940, 266, 'rect'],
  [22, 940, 430, 'rect'], [23, 940, 518, 'rect'],
]

export const HANSHIN_WINDOW_TABLES: TablePosition[] = drawing.map(([n, x, y, shape]) => ({
  tableId: `T${String(n).padStart(2, '0')}`,
  x, y,
  width: shape === 'rect' ? (n >= 19 ? 80 : 76) : shape === 'diamond' ? 110 : 96,
  height: shape === 'rect' ? (n >= 19 ? 84 : 96) : shape === 'diamond' ? 110 : 96,
  shape,
  capacity: 4,
}))

function rotate<T extends MapPosition>(position: T): T {
  return { ...position, x: FLOOR_WIDTH - position.x, y: FLOOR_HEIGHT - position.y }
}

/** Rotate positions only: table IDs and text remain upright and unchanged. */
export const HANSHIN_TABLES = HANSHIN_WINDOW_TABLES.map(rotate)
const windowLandmarks = [
  { label: '냉장고 · 주류', x: 105, y: 35, width: 190, height: 28 },
  { label: '카운터', x: 90, y: 195, width: 150, height: 28 },
  { label: '입구', x: 165, y: 625, width: 110, height: 28 },
  { label: '창가', x: 585, y: 620, width: 650, height: 28 },
]
const windowEvent = { label: '이벤트', x: 90, y: 345, width: 96, height: 96 }

export function getHanshinFloorPlan(view: FloorPlanView) {
  return {
    tables: view === 'window' ? HANSHIN_WINDOW_TABLES : HANSHIN_TABLES,
    landmarks: view === 'window' ? windowLandmarks : windowLandmarks.map(rotate),
    event: view === 'window' ? windowEvent : rotate(windowEvent),
  }
}
