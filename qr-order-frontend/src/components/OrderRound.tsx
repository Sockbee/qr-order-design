import type { ReactNode } from 'react'
import { OrderStatusChip } from './OrderStatusChip'
import { formatOrderTime } from '../utils/order'
import type { OrderStatus } from '../types/order'

interface OrderRoundProps {
  /** 1-based round number within the session. */
  round: number
  placedAt: string
  /** This round's own status — rounds advance independently. */
  status: OrderStatus
  /** A round the staff comped: billed 0, with a message written to the diner. */
  service?: boolean
  /** Staff-authored, rendered as plain text. Never HTML or markdown. */
  serviceMessage?: string | null
  chargedStaffName?: string | null
  children: ReactNode
}

export function OrderRound({
  round,
  placedAt,
  status,
  service = false,
  serviceMessage,
  chargedStaffName,
  children,
}: OrderRoundProps) {
  return (
    <section className="flex flex-col gap-3 w-full p-4 rounded-btn-xl bg-surface">
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 font-bold text-sm leading-[21px] text-body">
          {round}차 주문 · {formatOrderTime(placedAt)}
        </p>
        {/*
          A word, not just a colour — the badge is why this round costs 0, and
          it has to say so without relying on the tint (DESIGN.md §7).
        */}
        {service && (
          <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-[6px] text-[12px] leading-none font-bold whitespace-nowrap bg-[var(--color-status-served-bg)] text-[var(--color-status-served-fg)]">
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            서비스
          </span>
        )}
        <OrderStatusChip status={status} />
      </div>

      {/*
        The staff member's own sentence to this table. Quoted and attributed
        so it reads as something a person said, not as system copy — which is
        the whole reason the field exists.
      */}
      {service && serviceMessage && (
        <div className="flex flex-col gap-1 w-full py-3 px-3.5 rounded-[10px] bg-canvas border-l-[3px] border-l-primary">
          <p className="text-[15px] leading-[22px] font-normal text-strong break-words">
            {serviceMessage}
          </p>
          {chargedStaffName && (
            <p className="text-[12px] leading-[18px] font-normal text-body">
              {chargedStaffName} 드림
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}
