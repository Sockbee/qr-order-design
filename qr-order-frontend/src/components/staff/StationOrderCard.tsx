import './StationOrderCard.css'
import { ElapsedTimeIndicator } from './ElapsedTimeIndicator'
import { elapsedLevel, TABLE_ELAPSED } from '../../utils/elapsed'
import type { ElapsedThresholds } from '../../utils/elapsed'
import { OperationalButton } from './OperationalButton'
import type { StaffNoteAudience, StaffStationOrder } from '../../types/staff'

interface StationOrderCardProps {
  order: StaffStationOrder
  actionLabel: string
  actionVariant?: 'primary' | 'secondary'
  noteAudience: StaffNoteAudience
  elapsedSuffix?: string
  thresholds?: ElapsedThresholds
  busy: boolean
  onAction: (orderId: string) => void
}

/**
 * staff/KitchenOrderCard (88:68), shared by B01 and B02.
 *
 * It never shows money: the kitchen does not decide by price. The table
 * number is 32px so it reads at arm's length from the pass, and the only
 * thing that escalates as a ticket ages is the elapsed time.
 *
 * The next action lives inside the card — 조리 시작 / 조리 완료 / 서빙 완료.
 */
export function StationOrderCard({
  order,
  actionLabel,
  actionVariant = 'primary',
  noteAudience,
  elapsedSuffix,
  thresholds = TABLE_ELAPSED,
  busy,
  onAction,
}: StationOrderCardProps) {
  const late = elapsedLevel(order.elapsedMinutes, thresholds) === 'delayed'

  return (
    <article
      className={`station-card${late ? ' station-card--late' : ''}`}
      aria-label={`${order.tableId} 주문`}
    >
      <header className="station-card__head">
        <h3 className="station-card__table">{order.tableId}</h3>
        <ElapsedTimeIndicator
          minutes={order.elapsedMinutes}
          suffix={elapsedSuffix}
          thresholds={thresholds}
        />
      </header>

      <ul className="station-card__items">
        {order.items.map((item) => (
          <li key={item.name} className="station-card__item">
            <span className="station-card__item-name">{item.name}</span>
            <span className="station-card__item-qty">×{item.quantity}</span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className={`station-card__note station-card__note--${noteAudience}`}>
          <span className="station-card__note-tag">
            {noteAudience === 'kitchen' ? '주방' : '서빙'}
          </span>
          {order.note}
        </p>
      )}

      <OperationalButton
        block
        variant={actionVariant}
        loading={busy}
        onClick={() => onAction(order.orderId)}
      >
        {actionLabel}
      </OperationalButton>
    </article>
  )
}
