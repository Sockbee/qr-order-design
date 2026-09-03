import { formatPrice } from '../utils/price'

interface OrderLineProps {
  name: string
  quantity: number
  /** Line total: unit price including options, times quantity. */
  amount: number
  /**
   * A comped line. `amount` stays the list price and is struck through, with
   * 0원 beside it — the diner should see what the round was worth, not a
   * mystery row that reads as free for no stated reason.
   */
  comped?: boolean
}

export function OrderLine({ name, quantity, amount, comped = false }: OrderLineProps) {
  return (
    <div className="flex items-center gap-2 w-full">
      <p className="flex-1 min-w-0 text-base leading-6 font-normal text-strong overflow-hidden text-ellipsis whitespace-nowrap">
        {name} × {quantity}
      </p>
      {comped && (
        <p className="flex-none text-base leading-6 font-normal text-body line-through whitespace-nowrap">
          {formatPrice(amount)}
        </p>
      )}
      <p className="flex-none font-bold text-base leading-6 text-strong whitespace-nowrap">
        {comped ? formatPrice(0) : formatPrice(amount)}
      </p>
    </div>
  )
}
