import { DialogSummary, ImpactNote, StaffDialog } from './StaffDialog'
import './OperationDialogs.css'
import { formatStaffAmount } from '../../utils/price'

export interface SplitMember {
  tableId: string
  amount: number
  orderCount: number
}

interface SplitTablesDialogProps {
  groupLabel: string
  total: number
  totalOrderCount: number
  members: SplitMember[]
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** A06 — Split Tables (95:1260). */
export function SplitTablesDialog({
  groupLabel,
  total,
  totalOrderCount,
  members,
  submitting,
  onConfirm,
  onCancel,
}: SplitTablesDialogProps) {
  return (
    <StaffDialog
      title="테이블 분리"
      confirmLabel="분리하기"
      submitting={submitting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <DialogSummary
        label="현재 합석"
        table={groupLabel}
        meta={`${formatStaffAmount(total)} · 주문 ${totalOrderCount}건`}
        size="md"
      />
      <p className="operation-dialog__label">분리 후 각 테이블</p>
      <div className="operation-dialog__picked">
        {members.map((member) => (
          <div key={member.tableId} className="operation-dialog__picked-card operation-dialog__picked-card--plain">
            <p className="operation-dialog__picked-table">{member.tableId}</p>
            <p className="operation-dialog__picked-amount">
              {`${formatStaffAmount(member.amount)} · 주문 ${member.orderCount}건`}
            </p>
          </div>
        ))}
      </div>
      <ImpactNote title="분리하면 이렇게 됩니다">
        합석이 해제되고 각 주문은 원래 테이블로 돌아갑니다. 금액도 각자 정산됩니다.
        1인별 분할 계산은 하지 않습니다.
      </ImpactNote>
    </StaffDialog>
  )
}
