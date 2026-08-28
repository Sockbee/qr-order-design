import './OrderNote.css'
import { STAFF_NOTE_LABELS } from '../../types/staff'
import type { StaffNote } from '../../types/staff'

/**
 * staff/OrderNote (87:81). A memo is an operational instruction, so it is
 * never buried in a secondary menu. The tag says which team it is for —
 * 주방 notes surface in the kitchen view, 서빙 in the serving view, and
 * 메모 (general) only here.
 */
export function OrderNote({ note }: { note: StaffNote }) {
  return (
    <div className="order-note">
      <span className="order-note__tag">
        {STAFF_NOTE_LABELS[note.audience]}
      </span>
      <p className="order-note__text">{note.text}</p>
    </div>
  )
}
