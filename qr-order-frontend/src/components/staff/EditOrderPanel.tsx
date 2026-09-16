import './EditOrderPanel.css'
import { OperationalButton } from './OperationalButton'
import { QuantitySelector } from '../QuantitySelector'
import { formatStaffAmount } from '../../utils/price'
import type { StaffOrderItem } from '../../types/staff'

interface EditOrderPanelProps {
  tableId: string
  items: StaffOrderItem[]
  onQuantityChange: (itemId: string, quantity: number) => void
  onCancelItem: (itemId: string) => void
  onClose: () => void
}

/**
 * A08 — Edit Order (97:1407). Quantity changes apply
 * immediately; only cancelling a line goes through a confirm dialog, because
 * only cancelling destroys something.
 */
export function EditOrderPanel({
  tableId,
  items,
  onQuantityChange,
  onCancelItem,
  onClose,
}: EditOrderPanelProps) {
  return (
    <aside className="edit-panel" aria-label={`${tableId} 주문 수정`}>
      <header className="edit-panel__head">
        <div className="edit-panel__title-row">
          <h2 className="edit-panel__title">{`${tableId} 주문 수정`}</h2>
          <button
            type="button"
            className="edit-panel__close"
            aria-label="주문 수정 닫기"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p className="edit-panel__lead">
          수량 변경은 바로 반영됩니다 · 취소만 확인을 거칩니다
        </p>
      </header>

      <div className="edit-panel__list">
        <ul className="edit-panel__items">
          {items
            .filter((item) => !item.cancelled)
            .map((item) => (
              <li key={item.itemId} className="edit-panel__item">
                <div className="edit-panel__item-row">
                  <div className="edit-panel__item-info">
                    <span className="edit-panel__item-name">{item.name}</span>
                    <span className="edit-panel__item-amount">
                      {item.paymentMethod === 'COIN' ? `엽전 ${item.coinAmount ?? 0}개` : formatStaffAmount(item.amount)}
                    </span>
                  </div>
                  <QuantitySelector
                    value={item.quantity}
                    ariaLabel={`${item.name} 수량`}
                    disabled={item.coinReceived || item.preparationStatus === 'served' || (item.preparationStation !== 'SERVING' && item.preparationStatus !== 'pending')}
                    onChange={(next) => onQuantityChange(item.itemId, next)}
                  />
                </div>
                <div className="edit-panel__item-row">
                  <OperationalButton
                    variant="danger"
                    size="md"
                    disabled={item.coinReceived || item.preparationStatus === 'served' || (item.preparationStation !== 'SERVING' && item.preparationStatus !== 'pending')}
                    onClick={() => onCancelItem(item.itemId)}
                  >
                    {'항목 취소'}
                  </OperationalButton>
                </div>
              </li>
            ))}
        </ul>
      </div>

    </aside>
  )
}
