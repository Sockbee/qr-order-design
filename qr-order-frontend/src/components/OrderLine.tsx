import { formatPrice } from '../utils/price'
import './OrderLine.css'

interface OrderLineProps {
  name: string
  quantity: number
  /** Line total: unit price including options, times quantity. */
  amount: number
}

export function OrderLine({ name, quantity, amount }: OrderLineProps) {
  return (
    <div className="order-line">
      <p className="order-line__name">
        {name} × {quantity}
      </p>
      <p className="order-line__amount">{formatPrice(amount)}</p>
    </div>
  )
}
