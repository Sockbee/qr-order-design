/** Absolute timestamps use KST regardless of the staff device's time zone. */
export function visitElapsed(openedAt: string | null | undefined, now: number): string | null {
  if (!openedAt) return null
  return `입장 ${Math.max(0, Math.floor((now - Date.parse(openedAt)) / 60_000))}분 경과`
}
export function departureLabel(departureAt: string | null | undefined, now: number): string {
  if (!departureAt) return '퇴장 제한 없음'
  const remaining = Date.parse(departureAt) - now
  return remaining >= 0 ? `퇴장까지 ${Math.ceil(remaining / 60_000)}분` : `퇴장 ${Math.floor(-remaining / 60_000)}분 초과`
}
export function reservationSlots(day: string): Array<{ label: string; value: string }> {
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const tomorrow = next.toISOString().slice(0, 10)
  return ['19:50', '21:50', '23:50', '01:50'].map((time) => ({
    label: time === '01:50' ? '다음 날 01:50' : time,
    value: `${time === '01:50' ? tomorrow : day}T${time}:00+09:00`,
  }))
}
export function suggestedReservation(now: number) {
  const local = new Date(now + 9 * 3_600_000)
  if (local.getUTCHours() < 2) local.setUTCDate(local.getUTCDate() - 1)
  let day = local.toISOString().slice(0, 10)
  let slots = reservationSlots(day)
  if (!slots.some((slot) => Date.parse(slot.value) >= now)) {
    local.setUTCDate(local.getUTCDate() + 1); day = local.toISOString().slice(0, 10); slots = reservationSlots(day)
  }
  return { day, value: slots.find((slot) => Date.parse(slot.value) >= now)!.value }
}
