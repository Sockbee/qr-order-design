import type { OrderStatus } from '../types/order'

const LABELS: Record<OrderStatus, string> = {
  accepted: '접수됨',
  preparing: '조리 중',
  served: '서빙 완료',
  closed: '완료',
  cancelled: '취소됨',
}

const STATUS_CLASSES: Record<OrderStatus, string> = {
  accepted: 'bg-[var(--color-status-accepted-bg)] text-[var(--color-status-accepted-fg)]',
  preparing: 'bg-[var(--color-status-preparing-bg)] text-[var(--color-status-preparing-fg)]',
  served: 'bg-[var(--color-status-served-bg)] text-[var(--color-status-served-fg)]',
  closed: 'bg-[var(--color-status-closed-bg)] text-[var(--color-status-closed-fg)]',
  cancelled: 'bg-[var(--color-status-cancelled-bg)] text-[var(--color-status-cancelled-fg)]',
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
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-[6px] text-[12px] leading-none font-bold whitespace-nowrap ${STATUS_CLASSES[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[status]}
    </span>
  )
}
