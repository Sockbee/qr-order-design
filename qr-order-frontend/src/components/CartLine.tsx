import { QuantitySelector } from './QuantitySelector'
import { formatPrice } from '../utils/price'
import './CartLine.css'

interface CartLineProps {
  name: string
  /** " · "-joined selected option labels. Omitted when empty. */
  options?: string
  /** Line total: unit price including options, times quantity. */
  lineTotal: number
  quantity: number
  imageUrl?: string
  onQuantityChange: (next: number) => void
}

export function CartLine({
  name,
  options,
  lineTotal,
  quantity,
  imageUrl,
  onQuantityChange,
}: CartLineProps) {
  return (
    <div className="cart-line">
      <div className="cart-line__thumbnail">
        {imageUrl && <img src={imageUrl} alt="" />}
      </div>

      <div className="cart-line__info">
        <p className="cart-line__name">{name}</p>
        {options && <p className="cart-line__options">{options}</p>}
        <div className="cart-line__price-row">
          <p className="cart-line__price">{formatPrice(lineTotal)}</p>
          <QuantitySelector
            value={quantity}
            onChange={onQuantityChange}
            ariaLabel={`${name} 수량`}
          />
        </div>
      </div>
    </div>
  )
}
