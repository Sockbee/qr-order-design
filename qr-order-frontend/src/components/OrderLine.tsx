import { formatPrice } from '../utils/price'

interface OrderLineProps {
  name: string
  quantity: number
  /** Line total: unit price including options, times quantity. */
  amount: number
}

export function OrderLine({ name, quantity, amount }: OrderLineProps) {
  return (
    <div className="flex items-center gap-2 w-full">
      <p className="flex-1 min-w-0 text-base leading-6 font-normal text-strong overflow-hidden text-ellipsis whitespace-nowrap">
        {name} × {quantity}
      </p>
      <p className="flex-none font-bold text-base leading-6 text-strong whitespace-nowrap">
        {formatPrice(amount)}
      </p>
    </div>
  )
}
