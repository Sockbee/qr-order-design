import './StationOrderCard.css'
import { ElapsedTimeIndicator } from './ElapsedTimeIndicator'
import { elapsedLevel, TABLE_ELAPSED } from '../../utils/elapsed'
import type { ElapsedThresholds } from '../../utils/elapsed'
import { OperationalButton } from './OperationalButton'
import type { StaffStationOrder } from '../../types/staff'

interface StationOrderCardProps {
  order: StaffStationOrder
  actionLabel: string
  actionVariant?: 'primary' | 'secondary'
  mode: 'kitchen' | 'serving'
  elapsedSuffix?: string
  thresholds?: ElapsedThresholds
  busy: boolean
  busyItemId?: string | null
  onAction: (orderId: string) => void
  onToggleItem?: (orderId: string, itemId: string, ready: boolean) => void
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
  mode,
  elapsedSuffix,
  thresholds = TABLE_ELAPSED,
  busy,
  busyItemId = null,
  onAction,
  onToggleItem,
}: StationOrderCardProps) {
  const late = elapsedLevel(order.elapsedMinutes, thresholds) === 'delayed'
  const completed = order.items.filter(
    (item) => item.preparationStatus !== 'pending',
  ).length

  return (
    <article
      className={`station-card station-card--${mode}${late ? ' station-card--late' : ''}`}
      aria-label={`${order.tableId} 주문`}
    >
      <header className="station-card__head">
        <h3 className="station-card__table">{order.tableId}</h3>
        {mode === 'kitchen' && (
          <span className="station-card__progress">
            {`조리 ${completed}/${order.items.length}`}
          </span>
        )}
        {mode === 'serving' && order.remainingKitchenItemCount > 0 && (
          <span className="station-card__partial">
            {`일부 · 주방 ${order.remainingKitchenItemCount}개`}
          </span>
        )}
        <ElapsedTimeIndicator
          minutes={order.elapsedMinutes}
          suffix={elapsedSuffix}
          thresholds={thresholds}
        />
      </header>

      <ul className="station-card__items">
        {order.items.map((item) => (
          <li
            key={item.itemId}
            className={`station-card__item${mode === 'kitchen' && item.preparationStatus !== 'pending' ? ' station-card__item--done' : ''}`}
          >
            {mode === 'kitchen' && (
              <button
                type="button"
                role="checkbox"
                aria-checked={item.preparationStatus !== 'pending'}
                aria-label={`${item.name} 조리 완료`}
                className="station-card__check"
                disabled={busyItemId === item.itemId || item.preparationStatus === 'served'}
                onClick={() =>
                  onToggleItem?.(
                    order.orderId,
                    item.itemId,
                    item.preparationStatus === 'pending',
                  )
                }
              >
                {item.preparationStatus !== 'pending' ? '✓' : ''}
              </button>
            )}
            <span className="station-card__item-name">{item.name}</span>
            <span className="station-card__item-qty">×{item.quantity}</span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className={`station-card__note station-card__note--${mode}`}>
          <span className="station-card__note-tag">
            {mode === 'kitchen' ? '주방' : '서빙'}
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
