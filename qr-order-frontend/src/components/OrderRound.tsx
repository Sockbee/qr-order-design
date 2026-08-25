import type { ReactNode } from 'react'
import { formatOrderTime } from '../utils/order'
import './OrderRound.css'

interface OrderRoundProps {
  /** 1-based round number within the session. */
  round: number
  placedAt: string
  children: ReactNode
}

export function OrderRound({ round, placedAt, children }: OrderRoundProps) {
  return (
    <section className="order-round">
      <p className="order-round__label">
        {round}차 주문 · {formatOrderTime(placedAt)}
      </p>
      {children}
    </section>
  )
}
