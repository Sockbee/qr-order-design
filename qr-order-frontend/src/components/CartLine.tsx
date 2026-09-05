import { QuantitySelector } from './customer/QuantitySelector'
import { formatPrice } from '../utils/price'

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
    <div className="flex gap-3 items-start w-full">
      <div className="flex-none size-16 rounded-btn-lg bg-surface overflow-hidden">
        {imageUrl && <img className="w-full h-full object-cover" src={imageUrl} alt="" />}
      </div>

      <div className="flex flex-1 min-w-0 flex-col gap-1">
        <p className="font-bold text-base leading-6 text-strong truncate">{name}</p>
        {options && (
          <p className="w-full text-[13px] leading-[19px] font-normal text-body">{options}</p>
        )}
        <div className="flex items-center gap-2 w-full mt-0.5">
          <p className="flex-1 min-w-0 font-bold text-base leading-6 text-strong">
            {formatPrice(lineTotal)}
          </p>
          <QuantitySelector
            size="small"
            value={quantity}
            onChange={onQuantityChange}
            min={0}
            ariaLabel={`${name} 수량`}
          />
        </div>
      </div>
    </div>
  )
}
