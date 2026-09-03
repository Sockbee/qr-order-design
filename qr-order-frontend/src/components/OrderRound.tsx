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
  children: ReactNode
}

export function OrderRound({ round, placedAt, status, children }: OrderRoundProps) {
  return (
    <section className="flex flex-col gap-2 w-full py-4 px-0 border-t border-b border-border-default">
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 font-bold text-sm leading-[21px] text-body">
          {round}차 주문 · {formatOrderTime(placedAt)}
        </p>
        <OrderStatusChip status={status} />
      </div>
      {children}
    </section>
  )
}
