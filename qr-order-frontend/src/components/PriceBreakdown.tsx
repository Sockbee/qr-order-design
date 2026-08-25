import { formatPrice } from '../utils/price'
import type { CartTotals } from '../utils/cart'
import { VAT_RATE } from '../utils/cart'
import './PriceBreakdown.css'

interface PriceBreakdownProps {
  totals: CartTotals
}

export function PriceBreakdown({ totals }: PriceBreakdownProps) {
  const vatPercent = Math.round(VAT_RATE * 100)

  return (
    <dl className="price-breakdown">
      <div className="price-breakdown__row">
        <dt className="price-breakdown__label">주문금액</dt>
        <dd className="price-breakdown__value">
          {formatPrice(totals.subtotal)}
        </dd>
      </div>
      <div className="price-breakdown__row">
        <dt className="price-breakdown__label">부가세 ({vatPercent}%)</dt>
        <dd className="price-breakdown__value">{formatPrice(totals.vat)}</dd>
      </div>
      <div className="price-breakdown__row price-breakdown__row--total">
        <dt className="price-breakdown__label">총 결제금액</dt>
        <dd className="price-breakdown__value">{formatPrice(totals.total)}</dd>
      </div>
    </dl>
  )
}
