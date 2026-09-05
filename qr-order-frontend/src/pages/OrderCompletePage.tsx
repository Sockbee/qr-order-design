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
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-[var(--layout-safe-area-top)] pb-10">
        <p
          className="flex items-center justify-center size-16 rounded-full bg-primary text-on-primary animate-pop-in-slow motion-reduce:animate-none"
          aria-hidden="true"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </p>

        <h1 className="font-display font-normal text-[22px] leading-[30px] text-strong text-center animate-rise [animation-delay:60ms] motion-reduce:animate-none">
          <span className="block">테이블 {order.tableNumber} 주문이</span>
          <span className="block">접수되었어요</span>
        </h1>

        <p className="font-display font-normal text-[44px] leading-[52px] text-strong animate-rise [animation-delay:120ms] motion-reduce:animate-none">
          {formatPrice(order.total)}
        </p>

        <p className="text-[13px] leading-[19px] font-normal text-body animate-rise [animation-delay:160ms] motion-reduce:animate-none">
          주문번호 {order.number}
        </p>
      </main>

      <div className="flex flex-col gap-2 px-4 pt-3 pb-[var(--layout-safe-area)] bg-canvas">
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
    </div>
  )
}
