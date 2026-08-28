import './TableCard.css'
import { TableStatusBadge } from './TableStatusBadge'
import { formatStaffAmount } from '../../utils/price'
import { ELAPSED_DELAYED_MINUTES } from '../../api/staff/tables'
import type { StaffTableSummary } from '../../types/staff'

interface TableCardProps {
  table: StaffTableSummary
  /**
   * Omitted until A02 — Table Detail exists. Without a destination the tile
   * renders as plain content rather than a control that does nothing.
   */
  onSelect?: (tableId: string) => void
  /** True while this table's detail panel is open. */
  selected?: boolean
}

/**
 * staff/TableCard (87:45). The home screen's basic unit — the table is the
 * primary object.
 *
 * All four states share one anatomy: accent bar → table number → status →
 * amount → one meta line. Attention does not restyle the card; it adds the
 * accent bar, the dot and the emphasised meta line only. Merged swaps the
 * status badge for a 합석 chip so it cannot be mistaken for a normal table.
 *
 * `hasCall` is a boolean layered on top of any state, not a fifth state — a
 * call can arrive while cooking or while merged.
 */
export function TableCard({
  table,
  onSelect,
  selected = false,
}: TableCardProps) {
  const delayed =
    table.occupied &&
    !table.paid &&
    (table.elapsedMinutes ?? 0) >= ELAPSED_DELAYED_MINUTES
  const state = !table.occupied
    ? 'empty'
    : table.mergeLabel
      ? 'merged'
      : delayed
        ? 'attention'
        : 'active'

  const meta = table.occupied
    ? [
        delayed ? `${table.elapsedMinutes}분 지연` : `${table.elapsedMinutes}분`,
        `미처리 ${table.pendingItemCount}`,
        table.paid ? '결제 완료' : '미결제',
      ].join(' · ')
    : null

  const label = `${table.displayName}${table.occupied ? `, ${meta}` : ', 비어 있음'}${table.hasCall ? ', 직원 호출' : ''}`

  const content = (
    <>
      <span className="table-card__accent" aria-hidden="true" />
      <span className="table-card__body">
        <span className="table-card__table-row">
          <span className="table-card__number">{table.tableId}</span>
          {delayed && (
            <span className="table-card__attention-dot" aria-hidden="true" />
          )}
          {table.hasCall && (
            <span className="table-card__call-chip">
              <span className="table-card__call-dot" aria-hidden="true" />
              호출
            </span>
          )}
        </span>

        {!table.occupied && <span className="table-card__empty">비어 있음</span>}

        {table.mergeLabel && (
          <span className="table-card__merge-chip">{table.mergeLabel}</span>
        )}

        {table.occupied && !table.mergeLabel && table.status && (
          <TableStatusBadge status={table.status} />
        )}

        {table.occupied && (
          <span className="table-card__amount-row">
            <span className="table-card__amount">
              {formatStaffAmount(table.amount)}
            </span>
            {table.discountLabel && (
              <span className="table-card__discount">{table.discountLabel}</span>
            )}
          </span>
        )}

        {meta && <span className="table-card__meta">{meta}</span>}
      </span>
    </>
  )

  if (!onSelect) {
    return (
      <div className={`table-card table-card--${state}`} aria-label={label}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`table-card table-card--${state}${
        selected ? ' table-card--selected' : ''
      }`}
      onClick={() => onSelect(table.tableId)}
      aria-label={label}
      aria-pressed={selected}
    >
      {content}
    </button>
  )
}
