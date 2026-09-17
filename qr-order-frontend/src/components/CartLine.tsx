import { menuImageClassName } from '../data/menuImages'
import { QuantitySelector } from './customer/QuantitySelector'
import { formatPrice } from '../utils/price'

interface CartLineProps {
  name: string
  /** Line total: unit price times quantity. */
  lineTotal: number
  quantity: number
  maxQuantity?: number
  imageUrl?: string
  onQuantityChange: (next: number) => void
}

export function CartLine({
  name,
  lineTotal,
  quantity,
  maxQuantity,
  imageUrl,
  onQuantityChange,
}: CartLineProps) {
  return (
    <div className="flex gap-3 items-start w-full">
      <div className="flex-none size-16 rounded-btn-lg bg-surface overflow-hidden">
        {imageUrl && <img className={menuImageClassName(imageUrl)} src={imageUrl} alt="" />}
      </div>

      <div className="flex flex-1 min-w-0 flex-col gap-1">
        <p className="font-bold text-base leading-6 text-strong truncate">{name}</p>
        <div className="flex items-center gap-2 w-full mt-0.5">
          <p className="flex-1 min-w-0 font-bold text-base leading-6 text-strong">
            {formatPrice(lineTotal)}
          </p>
          <QuantitySelector
            size="small"
            value={quantity}
            onChange={onQuantityChange}
            min={0}
            max={maxQuantity}
            ariaLabel={`${name} 수량`}
          />
        </div>
      </div>
    </div>
  )
}
