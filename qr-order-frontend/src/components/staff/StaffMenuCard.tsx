import './StaffMenuCard.css'
import { formatStaffAmount } from '../../utils/price'
import type { MenuItemSummary } from '../../types/menu'

interface StaffMenuCardProps {
  item: MenuItemSummary
  onAdd: (itemId: string) => void
}

/**
 * The staff menu tile (92:840), now used by A10 — Service Grant. Tapping adds
 * it straight to the draft: the draft panel on the right is where a line is
 * still editable, and A10's own confirm dialog is the commit step.
 */
export function StaffMenuCard({ item, onAdd }: StaffMenuCardProps) {
  return (
    <button
      type="button"
      className={`menu-card${item.soldOut ? ' menu-card--sold-out' : ''}`}
      disabled={item.soldOut}
      onClick={() => onAdd(item.id)}
    >
      <span className="menu-card__row">
        <span className="menu-card__name">{item.name}</span>
        {item.soldOut && <span className="menu-card__badge">품절</span>}
      </span>
      <span className="menu-card__price">{formatStaffAmount(item.price)}</span>
    </button>
  )
}

interface AvailabilityCardProps {
  item: MenuItemSummary
  busy: boolean
  onChange: (itemId: string, soldOut: boolean) => void
}

/**
 * 품절 관리 (102:1579), the card behind `StaffAvailabilityPage`. Not an
 * inventory product — it does one thing: stop a dish that has run out from
 * being ordered. One tap switches it, with no confirm step, because it can be
 * switched straight back.
 */
export function AvailabilityCard({
  item,
  busy,
  onChange,
}: AvailabilityCardProps) {
  return (
    <div
      className={`availability-card${
        item.soldOut ? ' availability-card--sold-out' : ''
      }`}
    >
      <div className="availability-card__head">
        <span className="availability-card__name">{item.name}</span>
        <span className="availability-card__price">
          {formatStaffAmount(item.price)}
        </span>
      </div>
      <div
        className="availability-card__switch"
        role="radiogroup"
        aria-label={`${item.name} 판매 상태`}
      >
        <button
          type="button"
          role="radio"
          aria-checked={!item.soldOut}
          disabled={busy}
          className={`availability-card__option${
            !item.soldOut ? ' availability-card__option--on' : ''
          }`}
          onClick={() => onChange(item.id, false)}
        >
          판매 중
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={item.soldOut}
          disabled={busy}
          className={`availability-card__option${
            item.soldOut ? ' availability-card__option--off' : ''
          }`}
          onClick={() => onChange(item.id, true)}
        >
          품절
        </button>
      </div>
    </div>
  )
}
