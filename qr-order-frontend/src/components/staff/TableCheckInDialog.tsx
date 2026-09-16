import { useState } from 'react'
import { StaffDialog, DialogSummary, ImpactNote } from './StaffDialog'
import { reservationSlots, suggestedReservation } from '../../utils/tableVisit'
import type { StaffTableDetail } from '../../types/staff'
import './OperationDialogs.css'

export function TableCheckInDialog({ detail, submitting, onConfirm, onCancel }: {
  detail: StaffTableDetail; submitting: boolean; onConfirm: (departureAt: string | null) => void; onCancel: () => void
}) {
  const [suggestion] = useState(() => suggestedReservation(Date.now()))
  const [reserved, setReserved] = useState(Boolean(detail.departureAt))
  const [day, setDay] = useState(() => {
    if (!detail.departureAt) return suggestion.day
    const date = new Date(Date.parse(detail.departureAt) + 9 * 3_600_000)
    if (date.getUTCHours() < 2) date.setUTCDate(date.getUTCDate() - 1)
    return date.toISOString().slice(0, 10)
  })
  const [selected, setSelected] = useState(detail.departureAt ?? suggestion.value)
  const slots = reservationSlots(day)
  return <StaffDialog title={detail.openedAt ? '예약 시간 변경' : '테이블 입장'} confirmLabel={detail.openedAt ? '저장' : '입장 처리'} submitting={submitting} onConfirm={() => onConfirm(reserved ? selected : null)} onCancel={onCancel}>
    <DialogSummary label="입장 테이블" table={detail.mergeLabel ?? detail.tableId} meta={detail.openedAt ? '기존 입장 시간 유지' : '합석 그룹 전체에 적용'} />
    <fieldset className="visit-choice"><legend>방문 유형</legend><label><input type="radio" checked={!reserved} onChange={() => setReserved(false)} />당일 방문 · 퇴장 제한 없음</label><label><input type="radio" checked={reserved} onChange={() => setReserved(true)} />예약 방문</label></fieldset>
    {reserved && <fieldset className="visit-choice"><legend>예약 퇴장 시각 · 가장 가까운 회차 자동 제안</legend><label>영업일 <input type="date" value={day} onChange={(event) => { if (event.target.value) { setDay(event.target.value); setSelected(reservationSlots(event.target.value)[0].value) } }} /></label><div className="visit-slots">{slots.map((slot) => <label key={slot.value}><input type="radio" checked={Date.parse(selected) === Date.parse(slot.value)} onChange={() => setSelected(slot.value)} />{slot.label}</label>)}</div></fieldset>}
    <ImpactNote title="입장 시간과 퇴장 안내">먼저 접수된 고객 주문이 있다면 당시 입장 시간을 유지합니다. 퇴장 시각이 지나도 자동 퇴장하거나 주문을 차단하지 않습니다.</ImpactNote>
  </StaffDialog>
}
