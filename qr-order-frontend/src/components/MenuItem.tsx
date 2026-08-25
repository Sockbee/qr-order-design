import { Badge } from './Badge'
import { formatPrice } from '../utils/price'
import type { MenuItemSummary } from '../types/menu'
import './MenuItem.css'

interface MenuItemProps {
  item: MenuItemSummary
  onSelect?: (id: MenuItemSummary['id']) => void
}

export function MenuItem({ item, onSelect }: MenuItemProps) {
  const { name, description, price, soldOut, imageUrl } = item

  return (
    <button
      type="button"
      className={`menu-item${soldOut ? ' menu-item--sold-out' : ''}`}
      disabled={soldOut}
      onClick={() => onSelect?.(item.id)}
    >
      <span className="menu-item__info">
        <span className="menu-item__name-row">
          <span className="menu-item__name">{name}</span>
          {soldOut && <Badge>품절</Badge>}
        </span>
        <span className="menu-item__description">{description}</span>
        <span className="menu-item__price">{formatPrice(price)}</span>
      </span>
      <span className="menu-item__thumbnail">
        {imageUrl && <img src={imageUrl} alt="" />}
      </span>
    </button>
  )
}
