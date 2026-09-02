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
    <div className="sticky bottom-0 z-[2] bg-canvas ">
      <div className="flex p-4">
        <Button
          block
          size="xlarge"
          variant="fill"
          loading={updating}
          disabled={empty}
          label={empty ? '주문하기' : `주문하기 · ${formatPrice(total)}`}
          onClick={onOrder}
        />
      </div>
      <div className="h-[var(--layout-safe-area)] bg-canvas" />
    </div>
  )
}
