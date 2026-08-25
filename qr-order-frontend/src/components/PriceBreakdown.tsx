import { formatPrice } from '../utils/price'
import './PriceBreakdown.css'

interface PriceBreakdownProps {
  total: number
}

export function PriceBreakdown({ total }: PriceBreakdownProps) {
  return (
    <dl className="price-breakdown">
      <div className="price-breakdown__row">
        <dt className="price-breakdown__label">총 결제금액</dt>
        <dd className="price-breakdown__value">{formatPrice(total)}</dd>
      </div>
    </dl>
  )
}
