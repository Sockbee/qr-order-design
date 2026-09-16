import { describe, expect, it } from 'vitest'
import { departureLabel, reservationSlots, suggestedReservation, visitElapsed } from './tableVisit'
import { mapStaffTables } from '../api/staff/tables'

describe('visit clocks and reservations', () => {
  it('keeps KST late-night reservations on the following calendar day', () => {
    expect(reservationSlots('2026-09-16')[3]).toEqual({ label: '다음 날 01:50', value: '2026-09-17T01:50:00+09:00' })
    expect(suggestedReservation(Date.parse('2026-09-17T01:00:00+09:00'))).toEqual({ day: '2026-09-16', value: '2026-09-17T01:50:00+09:00' })
    expect(suggestedReservation(Date.parse('2026-09-17T01:51:00+09:00')).value).toBe('2026-09-17T19:50:00+09:00')
    expect(suggestedReservation(Date.parse('2026-09-16T20:00:00+09:00')).value).toBe('2026-09-16T21:50:00+09:00')
  })
  it('counts elapsed and overdue minutes without changing the visit', () => {
    const now = Date.parse('2026-09-16T20:25:00+09:00')
    expect(visitElapsed('2026-09-16T19:50:00+09:00', now)).toBe('입장 35분 경과')
    expect(departureLabel('2026-09-16T21:40:00+09:00', now)).toBe('퇴장까지 75분')
    expect(departureLabel('2026-09-16T20:20:00+09:00', now)).toBe('퇴장 5분 초과')
    expect(departureLabel(null, now)).toBe('퇴장 제한 없음')
    expect(visitElapsed(null, now)).toBeNull()
  })
  it('retains a prepared merge without making it occupied or starting a clock', () => {
    const table = mapStaffTables({ tables: [{ tableId: 'T17', displayName: '17', sessionStatus: 'PREPARED', orderStatus: null, paymentStatus: 'UNPAID', totalAmount: 0, openedAt: null, pendingItemCount: 0, hasPendingCall: false, mergeGroupLabel: 'T17+T18 합석', discountLabel: null }], stationCounts: { tables: 0, kitchen: 0, serving: 0, payment: 0 }, serverTime: '2026-09-16T10:00:00Z' })[0]
    expect(table).toMatchObject({ occupied: false, elapsedMinutes: null, mergeLabel: 'T17+T18 합석' })
  })
})
