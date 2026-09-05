import { Button } from './Button'
import { formatPrice } from '../utils/price'

interface BottomOrderBarProps {
  total: number
  itemCount: number
  updating?: boolean
  onOrder?: () => void
}

export function BottomOrderBar({
  total,
  itemCount,
  updating = false,
  onOrder,
}: BottomOrderBarProps) {
  const empty = itemCount === 0

  return (
    <div className="sticky bottom-0 z-[2] bg-canvas border-t border-border-default">
      <div className="flex px-4 pt-3 pb-[var(--layout-safe-area)]">
        <Button
          block
          size="xlarge"
          variant="fill"
          loading={updating}
          disabled={empty}
          count={empty ? undefined : itemCount}
          amount={empty ? undefined : formatPrice(total)}
          label="주문하기"
          onClick={onOrder}
        />
      </div>
    </div>
  )
}
