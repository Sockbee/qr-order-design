import { useState } from 'react'
import './EditOrderPanel.css'
import { OperationalButton } from './OperationalButton'
import { QuantitySelector } from '../QuantitySelector'
import { STAFF_NOTE_LABELS } from '../../types/staff'
import { formatStaffAmount } from '../../utils/price'
import type { StaffNoteAudience, StaffOrderItem } from '../../types/staff'

const AUDIENCES: StaffNoteAudience[] = ['kitchen', 'serving', 'general']

const AUDIENCE_CHIP_LABELS: Record<StaffNoteAudience, string> = {
  kitchen: '주방에 표시',
  serving: '서빙에 표시',
  general: '테이블만',
}

interface EditOrderPanelProps {
  tableId: string
  items: StaffOrderItem[]
  note: string
  noteAudience: StaffNoteAudience
  savingNote: boolean
  onQuantityChange: (itemId: string, quantity: number) => void
  onCancelItem: (itemId: string) => void
  onNoteChange: (note: string) => void
  onAudienceChange: (audience: StaffNoteAudience) => void
  onSaveNote: () => void
  onClose: () => void
}

/**
 * A08 — Edit Order / Note (97:1407). Quantity and option changes apply
 * immediately; only cancelling a line goes through a confirm dialog, because
 * only cancelling destroys something.
 */
export function EditOrderPanel({
  tableId,
  items,
  note,
  noteAudience,
  savingNote,
  onQuantityChange,
  onCancelItem,
  onNoteChange,
  onAudienceChange,
  onSaveNote,
  onClose,
}: EditOrderPanelProps) {
  const [draftNote, setDraftNote] = useState(note)

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
          수량·옵션 변경은 바로 반영됩니다 · 취소만 확인을 거칩니다
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
                      {formatStaffAmount(item.amount)}
                    </span>
                  </div>
                  <QuantitySelector
                    value={item.quantity}
                    ariaLabel={`${item.name} 수량`}
                    onChange={(next) => onQuantityChange(item.itemId, next)}
                  />
                </div>
                <div className="edit-panel__item-row">
                  <span className="edit-panel__item-option">
                    {`옵션 · ${item.optionSummary}`}
                  </span>
                  <OperationalButton
                    variant="danger"
                    size="md"
                    onClick={() => onCancelItem(item.itemId)}
                  >
                    항목 취소
                  </OperationalButton>
                </div>
              </li>
            ))}
        </ul>
      </div>

      <footer className="edit-panel__note">
        <p className="edit-panel__note-label">주문 메모</p>
        <textarea
          className="edit-panel__note-input"
          aria-label="주문 메모"
          rows={2}
          value={draftNote}
          onChange={(event) => {
            setDraftNote(event.target.value)
            onNoteChange(event.target.value)
          }}
        />
        <div
          className="edit-panel__audiences"
          role="radiogroup"
          aria-label="메모를 표시할 곳"
        >
          {AUDIENCES.map((audience) => (
            <button
              key={audience}
              type="button"
              role="radio"
              aria-checked={audience === noteAudience}
              className={`edit-panel__audience edit-panel__audience--${audience}${
                audience === noteAudience
                  ? ' edit-panel__audience--selected'
                  : ''
              }`}
              onClick={() => onAudienceChange(audience)}
              title={`${STAFF_NOTE_LABELS[audience]} 메모`}
            >
              {AUDIENCE_CHIP_LABELS[audience]}
            </button>
          ))}
        </div>
        <div className="edit-panel__note-actions">
          <OperationalButton variant="secondary" onClick={onClose}>
            취소
          </OperationalButton>
          <OperationalButton loading={savingNote} onClick={onSaveNote}>
            메모 저장
          </OperationalButton>
        </div>
      </footer>
    </aside>
  )
}
