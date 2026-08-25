import type { OrderStatus } from '../types/order'
import './OrderStatusChip.css'

const LABELS: Record<OrderStatus, string> = {
  accepted: '접수됨',
  preparing: '조리 중',
  served: '서빙 완료',
  closed: '완료',
  cancelled: '취소됨',
}

interface OrderStatusChipProps {
  status: OrderStatus
}

/**
 * Per-round status on S08.
 *
 * Once a table has two rounds one may be 조리 중 while another is 서빙 완료,
 * and the single top tracker cannot describe both. The tracker reflects the
 * newest round; these chips carry the truth.
 *
 * Descriptive, never interactive (DESIGN.md §7). The label states the status
 * so it reads without relying on colour.
 */
export function OrderStatusChip({ status }: OrderStatusChipProps) {
  return (
    <span className={`order-status-chip order-status-chip--${status}`}>
      <span className="order-status-chip__dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  )
}
