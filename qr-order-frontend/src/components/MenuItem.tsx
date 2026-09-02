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
      className="flex gap-4 items-start w-full py-4 px-0 border-0 border-b border-border-default bg-canvas text-left cursor-pointer transition-colors duration-150 ease-out motion-reduce:transition-none enabled:active:bg-surface disabled:cursor-default"
      disabled={soldOut}
      onClick={() => onSelect?.(item.id)}
    >
      <span className="flex flex-1 min-w-0 flex-col gap-1">
        <span className="flex items-center gap-1.5 w-full">
          <span
            className={`font-bold text-base leading-6 whitespace-nowrap overflow-hidden text-ellipsis ${soldOut ? 'text-muted' : 'text-strong'}`}
          >
            {name}
          </span>
          {soldOut && <Badge>품절</Badge>}
        </span>
        <span
          className={`text-sm leading-[21px] font-normal whitespace-nowrap overflow-hidden text-ellipsis ${soldOut ? 'text-muted' : 'text-body'}`}
        >
          {description}
        </span>
        <span
          className={`font-bold text-base leading-6 ${soldOut ? 'text-body' : 'text-strong'}`}
        >
          {formatPrice(price)}
        </span>
      </span>
      <span
        className={`flex-none w-20 h-20 rounded-btn-sm bg-surface overflow-hidden ${soldOut ? 'opacity-40' : ''}`}
      >
        {imageUrl && <img className="w-full h-full object-cover" src={imageUrl} alt="" />}
      </span>
    </button>
  )
}
