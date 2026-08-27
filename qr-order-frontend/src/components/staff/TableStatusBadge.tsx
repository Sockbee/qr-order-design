import './TableStatusBadge.css'
import {
  STAFF_ORDER_STATUS_LABELS,
  type StaffOrderStatus,
} from '../../types/staff'

/**
 * staff/TableStatusBadge (82:20). The label carries the state and colour only
 * reinforces it — these are never distinguishable by colour alone. Weak tints
 * only; #e42939 stays reserved for failure and delay.
 */
export function TableStatusBadge({ status }: { status: StaffOrderStatus }) {
  return (
    <span className={`table-status-badge table-status-badge--${status}`}>
      <span className="table-status-badge__dot" aria-hidden="true" />
      {STAFF_ORDER_STATUS_LABELS[status]}
    </span>
  )
}
