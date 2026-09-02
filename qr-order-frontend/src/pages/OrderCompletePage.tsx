import { Button } from '../components/Button'
import { formatPrice } from '../utils/price'
import type { PlacedOrder } from '../types/order'

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
    <div className="flex flex-col min-h-dvh bg-canvas">
      <main className="flex flex-1 flex-col items-center gap-4 pt-30 px-4 pb-0">
        <p
          className="flex items-center justify-center w-16 h-16 rounded-full bg-weak text-link font-display font-normal text-2xl leading-9"
          aria-hidden="true"
        >
          ✓
        </p>

        <h1 className="font-display font-normal text-[22px] leading-[33px] text-strong text-center">
          <span className="block">테이블 {order.tableNumber} 주문이</span>
          <span className="block">접수되었어요</span>
        </h1>

        <p className="font-display font-normal text-4xl leading-[54px] text-strong">
          {formatPrice(order.total)}
        </p>

        <p className="text-sm leading-[21px] font-normal text-body">주문번호 {order.number}</p>
      </main>

      <div className="flex flex-col gap-2 p-4 bg-canvas border-t border-border-default">
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
      <div className="h-[var(--layout-safe-area)] bg-canvas" />
    </div>
  )
}
