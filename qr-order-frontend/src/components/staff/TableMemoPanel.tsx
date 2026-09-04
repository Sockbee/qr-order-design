import './TableMemoPanel.css'
import { OperationalButton } from './OperationalButton'
import { STAFF_NOTE_LABELS } from '../../types/staff'
import type { StaffNoteAudience } from '../../types/staff'

const AUDIENCES: StaffNoteAudience[] = ['kitchen', 'serving', 'general']

const AUDIENCE_CHIP_LABELS: Record<StaffNoteAudience, string> = {
  kitchen: '주방에 표시',
  serving: '서빙에 표시',
  general: '테이블만',
}

interface TableMemoPanelProps {
  tableId: string
  note: string
  noteAudience: StaffNoteAudience
  saving: boolean
  onNoteChange: (note: string) => void
  onAudienceChange: (audience: StaffNoteAudience) => void
  onSave: () => void
  onClose: () => void
}

/**
 * 테이블 메모. Split out of A08 Edit Order / Note so 메모 and 주문수정 land
 * on separate screens — both used to route to the combined edit panel
 * (github.com/Sockbee/qr-order-design/issues/37).
 */
export function TableMemoPanel({
  tableId,
  note,
  noteAudience,
  saving,
  onNoteChange,
  onAudienceChange,
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
        <div
          className="memo-panel__audiences"
          role="radiogroup"
          aria-label="메모를 표시할 곳"
        >
          {AUDIENCES.map((audience) => (
            <button
              key={audience}
              type="button"
              role="radio"
              aria-checked={audience === noteAudience}
              className={`memo-panel__audience memo-panel__audience--${audience}${
                audience === noteAudience
                  ? ' memo-panel__audience--selected'
                  : ''
              }`}
              onClick={() => onAudienceChange(audience)}
              title={`${STAFF_NOTE_LABELS[audience]} 메모`}
            >
              {AUDIENCE_CHIP_LABELS[audience]}
            </button>
          ))}
        </div>
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
