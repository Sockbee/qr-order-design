/**
 * Fallback content for API-free staff UI development, mirroring the sample
 * floor drawn on A01 — Table Home (90:2). Only `useStaffTableHome` reads it,
 * and only while `VITE_STAFF_APPS_SCRIPT_URL` is absent. Pages must never
 * import it directly.
 */

import type { StaffCallGroup, StaffTableSummary } from '../types/staff'

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
