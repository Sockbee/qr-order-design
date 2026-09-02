import { formatPrice } from '../utils/price'

interface PriceBreakdownProps {
  total: number
}

export function PriceBreakdown({ total }: PriceBreakdownProps) {
  return (
    <dl className="m-0 flex flex-col gap-2 w-full pt-4 border-t border-border-default">
      <div className="flex items-center gap-2 w-full font-display font-normal text-[22px] leading-[33px] text-strong">
        <dt className="m-0 flex-1 min-w-0">총 결제금액</dt>
        <dd className="m-0 flex-none whitespace-nowrap">{formatPrice(total)}</dd>
      </div>
    </dl>
  )
}
