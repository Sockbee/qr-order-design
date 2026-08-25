import { Button } from './Button'
import { formatPrice } from '../utils/price'
import './BottomOrderBar.css'

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
    <div className="bottom-order-bar">
      <div className="bottom-order-bar__row">
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
      <div className="bottom-order-bar__safe-area" />
    </div>
  )
}
