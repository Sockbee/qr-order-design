import { Badge } from './Badge'
import { formatPrice } from '../utils/price'
import type { MenuItemSummary } from '../types/menu'

interface MenuItemProps {
  item: MenuItemSummary
  onSelect?: (id: MenuItemSummary['id']) => void
}

export function MenuItem({ item, onSelect }: MenuItemProps) {
  const { name, description, price, soldOut, imageUrl } = item

  return (
    <button
      type="button"
      className="flex gap-4 items-center w-full py-4 px-0 border-0 border-b border-dashed border-border-default bg-transparent text-left cursor-pointer transition-opacity duration-150 ease-out-soft motion-reduce:transition-none enabled:active:opacity-70 disabled:cursor-default"
      disabled={soldOut}
      onClick={() => onSelect?.(item.id)}
    >
      <span
        className={`flex-none size-[84px] rounded-btn-xl bg-surface overflow-hidden ${
          soldOut ? 'grayscale opacity-45' : ''
        }`}
      >
        {imageUrl && <img className="w-full h-full object-cover" src={imageUrl} alt="" />}
      </span>
      <span className="flex flex-1 min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 w-full min-w-0">
          <span
            className={`min-w-0 truncate font-bold text-[17px] leading-6 tracking-[-0.2px] ${
              soldOut ? 'text-muted' : 'text-strong'
            }`}
          >
            {name}
          </span>
          {soldOut && (
            <Badge size="small" tone="outline">
              품절
            </Badge>
          )}
        </span>
        <span
          className={`truncate text-[13px] leading-[19px] font-normal ${
            soldOut ? 'text-muted' : 'text-body'
          }`}
        >
          {description}
        </span>
        <span
          className={`mt-0.5 font-bold text-base leading-[22px] ${
            soldOut ? 'text-body' : 'text-strong'
          }`}
        >
          {formatPrice(price)}
        </span>
      </span>
    </button>
  )
}
