import './TableMemoPanel.css'
import { OperationalButton } from './OperationalButton'

interface TableMemoPanelProps {
  tableId: string
  note: string
  saving: boolean
  onNoteChange: (note: string) => void
  onSave: () => void
  onClose: () => void
}

/**
 * 테이블 메모. Split out of A08 Edit Order / Note so 메모 and 주문수정 land
 * on separate screens — both used to route to the combined edit panel
 * (github.com/Sockbee/qr-order-design/issues/37). Table-only, no
 * kitchen/serving audience targeting — that concept stays with station
 * notes attached to individual orders, not this panel.
 */
export function TableMemoPanel({
  tableId,
  note,
  saving,
  onNoteChange,
  onSave,
  onClose,
}: TableMemoPanelProps) {
  return (
    <aside className="memo-panel" aria-label={`${tableId} 테이블 메모`}>
      <header className="memo-panel__head">
        <div className="memo-panel__title-row">
          <h2 className="memo-panel__title">{`${tableId} 테이블 메모`}</h2>
          <button
            type="button"
            className="memo-panel__close"
            aria-label="테이블 메모 닫기"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="memo-panel__body">
        <textarea
          className="memo-panel__input"
          aria-label="테이블 메모"
          rows={4}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
        <div className="memo-panel__actions">
          <OperationalButton variant="secondary" onClick={onClose}>
            취소
          </OperationalButton>
          <OperationalButton loading={saving} onClick={onSave}>
            메모 저장
          </OperationalButton>
        </div>
      </div>
    </aside>
  )
}
