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
  onAction: (order: StaffStationOrder) => void
  onToggleItem?: (order: StaffStationOrder, itemId: string) => void
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

  return (
    <article
      className={`station-card station-card--${mode}${late ? ' station-card--late' : ''}`}
      aria-label={`${order.tableId} 주문`}
    >
      <header className="station-card__head">
        <h3 className="station-card__table">{order.tableId}</h3>
        {mode === 'kitchen' && (
          <span className="station-card__progress">
            {`${order.status === 'new' ? '대기' : '조리 중'} ${order.items.length}개`}
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

      {order.paymentMethod === 'COIN' && <p className="station-card__coins">엽전 주문 · {order.coinTotal}개 · {order.coinReceived ? '수령 완료' : '수령 대기'}</p>}
      <ul className="station-card__items">
        {order.items.map((item) => (
          <li
            key={item.itemId}
            className="station-card__item"
          >
            {mode === 'kitchen' && (
              <button
                type="button"
                role="checkbox"
                aria-checked={false}
                aria-label={`${item.name}${item.unitNumber ? ` ${item.unitNumber}번째` : ''} 1개 ${order.status === 'new' ? '조리 시작' : '조리 완료'}`}
                className="station-card__check"
                disabled={busy || busyItemId !== null}
                onClick={() => onToggleItem?.(order, item.itemId)}
              />
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
        onClick={() => onAction(order)}
      >
        {actionLabel}
      </OperationalButton>
    </article>
  )
}
