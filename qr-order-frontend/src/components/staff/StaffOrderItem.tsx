import './StaffOrderItem.css'
import { formatStaffAmount } from '../../utils/price'
import type { StaffOrderItem as OrderItem } from '../../types/staff'

/**
 * staff/StaffOrderItem (87:68). One line of the table's order list.
 *
 * A cancelled line is struck through and chipped, never deleted — an
 * operational record that disappears cannot settle a dispute later.
 *
 * Memos are table-level only (`TableMemoPanel`) — there is no per-item memo.
 */
export function StaffOrderItem({ item }: { item: OrderItem }) {
  return (
    <li
      className={`order-item${item.cancelled ? ' order-item--cancelled' : ''}`}
    >
      <div className="order-item__line">
        <div className="order-item__info">
          <span className="order-item__name">{item.name}</span>
          <span className="order-item__option">{item.optionSummary}</span>
          {item.cancelled && (
            <span className="order-item__cancel-chip">취소됨</span>
          )}
        </div>
        <span className="order-item__qty">×{item.quantity}</span>
        <span className="order-item__amount">
          {formatStaffAmount(item.amount)}
        </span>
      </div>
    </li>
  )
}
