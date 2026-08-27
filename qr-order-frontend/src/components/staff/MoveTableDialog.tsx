import { useState } from 'react'
import { DialogSummary, ImpactNote, StaffDialog } from './StaffDialog'
import { TableChoice } from './TableChoice'
import './OperationDialogs.css'
import { formatStaffAmount } from '../../utils/price'
import type { StaffTableSummary } from '../../types/staff'

interface MoveTableDialogProps {
  source: StaffTableSummary
  orderCount: number
  tables: StaffTableSummary[]
  submitting: boolean
  onConfirm: (toTableId: string) => void
  onCancel: () => void
}

/** A04 — Move Table (93:852). */
export function MoveTableDialog({
  source,
  orderCount,
  tables,
  submitting,
  onConfirm,
  onCancel,
}: MoveTableDialogProps) {
  const [destination, setDestination] = useState<string | null>(null)

  const candidates = tables.filter(
    (table) => table.tableId !== source.tableId,
  )

  return (
    <StaffDialog
      title="테이블 이동"
      confirmLabel={destination ? `${destination}로 이동` : '이동'}
      confirmDisabled={!destination}
      submitting={submitting}
      onConfirm={() => destination && onConfirm(destination)}
      onCancel={onCancel}
    >
      <DialogSummary
        label="현재 테이블"
        table={source.tableId}
        meta={`${formatStaffAmount(source.amount)} · 주문 ${orderCount}건`}
      />
      <p className="operation-dialog__arrow" aria-hidden="true">
        ↓
      </p>
      <p className="operation-dialog__label">이동할 테이블 선택</p>
      <div className="operation-dialog__choices">
        {candidates.map((table) => (
          <TableChoice
            key={table.tableId}
            tableId={table.tableId}
            caption={table.occupied ? '사용 중' : '비어 있음'}
            /* An occupied destination is a merge, not a move (§4.14). */
            disabled={table.occupied}
            selected={table.tableId === destination}
            onSelect={setDestination}
          />
        ))}
      </div>
      <ImpactNote title="이동하면 이렇게 됩니다">
        {destination
          ? `${source.tableId}의 주문 ${orderCount}건과 ${formatStaffAmount(source.amount)}이 ${destination}로 옮겨집니다. ${source.tableId}은 비어 있음이 되고, 주문 이력은 ${destination}에 그대로 남습니다.`
          : '옮길 테이블을 고르면 결과를 보여드릴게요.'}
      </ImpactNote>
    </StaffDialog>
  )
}
