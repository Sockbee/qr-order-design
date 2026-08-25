import { Button } from '../components/Button'
import { formatPrice } from '../utils/price'
import type { PlacedOrder } from '../types/order'
import './OrderCompletePage.css'

interface OrderCompletePageProps {
  order: PlacedOrder
  onViewStatus: () => void
  onOrderMore: () => void
}

export function OrderCompletePage({
  order,
  onViewStatus,
  onOrderMore,
}: OrderCompletePageProps) {
  return (
    <div className="order-complete">
      <main className="order-complete__content">
        <p className="order-complete__mark" aria-hidden="true">
          ✓
        </p>

        <h1 className="order-complete__headline">
          <span>테이블 {order.tableNumber} 주문이</span>
          <span>접수되었어요</span>
        </h1>

        <p className="order-complete__total">{formatPrice(order.total)}</p>

        <p className="order-complete__number">주문번호 {order.number}</p>
      </main>

      <div className="order-complete__footer">
        <Button
          block
          size="xlarge"
          variant="fill"
          label="주문 현황 보기"
          onClick={onViewStatus}
        />
        <Button
          block
          size="large"
          variant="weak"
          label="추가 주문"
          onClick={onOrderMore}
        />
      </div>
      <div className="order-complete__safe-area" />
    </div>
  )
}
