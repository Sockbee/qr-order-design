import { useState } from 'react'
import { StaffDialog } from './StaffDialog'
import './OperationDialogs.css'

interface TableNoteDialogProps {
  tableId: string
  initialNote: string
  submitting: boolean
  onConfirm: (note: string) => void
  onCancel: () => void
}

/** A11 — one general memo scoped to the current visit. */
export function TableNoteDialog({
  tableId,
  initialNote,
  submitting,
  onConfirm,
  onCancel,
}: TableNoteDialogProps) {
  const [note, setNote] = useState(initialNote)

  return (
    <StaffDialog
      title={`${tableId} 테이블 메모`}
      confirmLabel="메모 저장"
      submitting={submitting}
      onConfirm={() => onConfirm(note)}
      onCancel={onCancel}
    >
      <label className="operation-dialog__field">
        <span className="operation-dialog__label">메모</span>
        <textarea
          autoFocus
          className="operation-dialog__textarea"
          maxLength={200}
          value={note}
          placeholder="이 방문에 필요한 내용을 남겨주세요"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <p className="operation-dialog__helper">
        이 방문에만 적용됩니다 · 결제나 초기화로 방문이 끝나면 다음 손님에게
        보이지 않습니다
      </p>
    </StaffDialog>
  )
}

