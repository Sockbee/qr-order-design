/**
 * Fallback content for API-free staff UI development, mirroring the sample
 * floor drawn on A01 — Table Home (90:2). Only `useStaffTableHome` reads it,
 * and only while `VITE_API_BASE_URL` is absent. Pages must never
 * import it directly.
 */

import type {
  StaffCallGroup,
  StaffPaymentOrder,
  StaffStationOrder,
  StaffTableDetail,
  StaffTableSummary,
} from '../types/staff'

interface Seed {
  n: number
  amount?: number
  minutes?: number
  pending?: number
  paid?: boolean
  call?: boolean
  merge?: string
  discount?: string
}

const SEEDS: Seed[] = [
  { n: 1, amount: 42_000, minutes: 18, pending: 3 },
  { n: 2, amount: 28_000, minutes: 7, pending: 1 },
  { n: 3, amount: 64_000, minutes: 38, pending: 3, call: true, discount: '20% 할인' },
  { n: 4, amount: 81_000, minutes: 22, pending: 2, merge: 'T01+T02 합석', discount: '20% 할인' },
  { n: 5, amount: 15_000, minutes: 3, pending: 2 },
  { n: 6, amount: 37_000, minutes: 12, pending: 0 },
  { n: 7, amount: 52_000, minutes: 16, pending: 4 },
  { n: 8 },
  { n: 9, amount: 23_000, minutes: 9, pending: 1, call: true },
  { n: 10, amount: 46_000, minutes: 41, pending: 2, discount: '20% 할인' },
  { n: 11 },
  { n: 12, amount: 19_000, minutes: 5, pending: 0, paid: true },
  { n: 13 },
  { n: 14, amount: 33_000, minutes: 14, pending: 2 },
  { n: 15 },
]

export const staffTables: StaffTableSummary[] = SEEDS.map((seed) => {
  const tableId = `T${String(seed.n).padStart(2, '0')}`
  const occupied = seed.amount !== undefined
  return {
    tableId,
    displayName: `테이블 ${seed.n}`,
    occupied,
    status: occupied ? 'cooking' : null,
    amount: seed.amount ?? 0,
    elapsedMinutes: seed.minutes ?? null,
    pendingItemCount: seed.pending ?? 0,
    paid: seed.paid ?? false,
    hasCall: seed.call ?? false,
    mergeLabel: seed.merge ?? null,
    discountLabel: seed.discount ?? null,
  }
})

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString()

export const staffCallGroups: StaffCallGroup[] = [
  {
    tableId: 'T03',
    displayName: '테이블 3',
    count: 3,
    reasons: ['WATER_UTENSIL', 'PAYMENT_REQUEST'],
    firstCalledAt: minutesAgo(4),
    lastCalledAt: minutesAgo(0),
    callIds: ['seed-c41e', 'seed-d90b', 'seed-e02c'],
  },
  {
    tableId: 'T09',
    displayName: '테이블 9',
    count: 1,
    reasons: ['PAYMENT_REQUEST'],
    firstCalledAt: minutesAgo(1),
    lastCalledAt: minutesAgo(1),
    callIds: ['seed-a17f'],
  },
]

/** The sample table drawn in the A02 inspector (89:8). */
export function staffTableDetail(tableId: string): StaffTableDetail {
  const table = staffTables.find((candidate) => candidate.tableId === tableId)
  const subtotal = table?.amount ?? 0
  const discountRate = table?.discountLabel ? 20 : 0
  const discountAmount = Math.floor((subtotal * discountRate) / 100)
  const call = staffCallGroups.find(
    (group) => group.tableId === tableId,
  )

  return {
    tableId,
    displayName: table?.displayName ?? tableId,
    status: table?.status ?? null,
    elapsedMinutes: table?.elapsedMinutes ?? null,
    bill: {
      subtotalAmount: subtotal,
      discountRate,
      discountAmount,
      finalAmount: subtotal - discountAmount,
      paid: table?.paid ?? false,
    },
    items: [
      {
        itemId: `${tableId}-1`,
        name: '김치전',
        optionSummary: '바삭하게',
        quantity: 2,
        amount: 18_000,
        cancelled: false,
        note: '고수 빼주세요',
      },
      {
        itemId: `${tableId}-2`,
        name: '떡볶이',
        optionSummary: '기본',
        quantity: 1,
        amount: 9_000,
        cancelled: false,
        note: null,
      },
      {
        itemId: `${tableId}-3`,
        name: '소주',
        optionSummary: '참이슬',
        quantity: 3,
        amount: 15_000,
        cancelled: false,
        note: null,
      },
      {
        itemId: `${tableId}-4`,
        name: '해물파전',
        optionSummary: '—',
        quantity: 1,
        amount: 15_000,
        cancelled: true,
        note: null,
      },
    ],
    notes: [
      {
        noteId: `${tableId}-note-1`,
        audience: 'general',
        text: '선배님 테이블 — 접시 여유 있게',
      },
    ],
    call: call ?? null,
    mergeLabel: table?.mergeLabel ?? null,
  }
}

/** Seeded B01–B03 queues, mirroring the frames. */
export const staffQueues = {
  kitchen: [
    { orderId: 'k1', tableId: 'T09', status: 'new' as const, elapsedMinutes: 4 },
    { orderId: 'k2', tableId: 'T12', status: 'new' as const, elapsedMinutes: 4 },
    { orderId: 'k3', tableId: 'T05', status: 'new' as const, elapsedMinutes: 4 },
    { orderId: 'k4', tableId: 'T01', status: 'cooking' as const, elapsedMinutes: 16 },
    { orderId: 'k5', tableId: 'T07', status: 'cooking' as const, elapsedMinutes: 16 },
    { orderId: 'k6', tableId: 'T03', status: 'cooking' as const, elapsedMinutes: 31 },
  ],
  serving: [
    { orderId: 's1', tableId: 'T06', elapsedMinutes: 0 },
    { orderId: 's2', tableId: 'T02', elapsedMinutes: 0 },
    { orderId: 's3', tableId: 'T14', elapsedMinutes: 6 },
    { orderId: 's4', tableId: 'T10', elapsedMinutes: 14 },
  ],
  payment: [
    { tableId: 'T08', subtotal: 50_000, paid: false },
    { tableId: 'T04', subtotal: 91_000, paid: false },
    { tableId: 'T12', subtotal: 29_000, paid: false },
    { tableId: 'T11', subtotal: 43_000, paid: true },
    { tableId: 'T13', subtotal: 32_000, paid: true },
    { tableId: 'T15', subtotal: 67_000, paid: true },
  ],
}

const KITCHEN_ITEMS = [
  { name: '김치전', quantity: 2 },
  { name: '떡볶이', quantity: 1 },
  { name: '소주', quantity: 3 },
]

const SERVING_ITEMS = [
  { name: '김치전', quantity: 2 },
  { name: '떡볶이', quantity: 1 },
]

export function staffKitchenQueue(): StaffStationOrder[] {
  return staffQueues.kitchen.map((order) => ({
    orderId: order.orderId,
    tableId: order.tableId,
    status: order.status,
    elapsedMinutes: order.elapsedMinutes,
    items: KITCHEN_ITEMS,
    note: '김치전 먼저',
  }))
}

export function staffServingQueue(): StaffStationOrder[] {
  return staffQueues.serving.map((order) => ({
    orderId: order.orderId,
    tableId: order.tableId,
    status: 'ready' as const,
    elapsedMinutes: order.elapsedMinutes,
    items: SERVING_ITEMS,
    note: '접시 추가 필요',
  }))
}

export function staffPaymentQueue(): StaffPaymentOrder[] {
  return staffQueues.payment.map((row) => {
    const discountAmount = Math.floor((row.subtotal * 20) / 100)
    return {
      tableId: row.tableId,
      bill: {
        subtotalAmount: row.subtotal,
        discountRate: 20,
        discountAmount,
        finalAmount: row.subtotal - discountAmount,
        paid: row.paid,
      },
      minutesSinceServed: 12,
      confirming: false,
    }
  })
}
