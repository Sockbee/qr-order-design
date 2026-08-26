import type { ReactNode } from 'react'
import { OrderStatusChip } from './OrderStatusChip'
import { formatOrderTime } from '../utils/order'
import type { OrderStatus } from '../types/order'
import './OrderRound.css'

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
    <section className="order-round">
      <div className="order-round__head">
        <p className="order-round__label">
          {round}차 주문 · {formatOrderTime(placedAt)}
        </p>
        <OrderStatusChip status={status} />
      </div>
      {children}
    </section>
  )
}
