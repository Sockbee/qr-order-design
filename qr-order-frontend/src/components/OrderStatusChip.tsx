import { useState } from 'react'
import type { OrderStatus } from '../types/order'

const LABELS: Record<OrderStatus, string> = {
  accepted: '접수됨',
  preparing: '조리 중',
  served: '서빙 완료',
  closed: '서빙 완료',
  cancelled: '취소됨',
}

const STATUS_CLASSES: Record<OrderStatus, string> = {
  accepted: 'bg-[var(--color-status-accepted-bg)] text-[var(--color-status-accepted-fg)]',
  preparing: 'bg-[var(--color-status-preparing-bg)] text-[var(--color-status-preparing-fg)]',
  served: 'bg-[var(--color-status-served-bg)] text-[var(--color-status-served-fg)]',
  closed: 'bg-[var(--color-status-served-bg)] text-[var(--color-status-served-fg)]',
  cancelled: 'bg-[var(--color-status-cancelled-bg)] text-[var(--color-status-cancelled-fg)]',
}

interface OrderStatusChipProps {
  status: OrderStatus
}

/**
 * Per-round status on S08.
 *
 * Once a table has two rounds one may be 조리 중 while another is 서빙 완료,
 * and the single top tracker cannot describe both. The tracker summarises all active rounds;
 * these chips carry the progress of each round and menu item.
 *
 * Descriptive, never interactive (DESIGN.md §7). The label states the status
 * so it reads without relying on colour.
 */
export function OrderStatusChip({ status }: OrderStatusChipProps) {
  // transitions.dev "text states swap": when the round moves on, the new
  // label rises in through a short blur and the tint eases across. The first
  // render stays still.
  const [shown, setShown] = useState({ status, swaps: 0 })
  if (shown.status !== status) setShown({ status, swaps: shown.swaps + 1 })

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-[6px] text-[12px] leading-none font-bold whitespace-nowrap transition-colors duration-(--motion-duration-base) ease-out-soft motion-reduce:transition-none ${STATUS_CLASSES[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      <span
        key={shown.swaps}
        // inline-block: transforms do not apply to an inline span.
        className={`inline-block ${shown.swaps > 0 ? 'animate-text-swap motion-reduce:animate-none' : ''}`}
      >
        {LABELS[status]}
      </span>
    </span>
  )
}
