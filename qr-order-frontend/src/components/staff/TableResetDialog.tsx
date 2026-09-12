import { DialogSummary, ImpactNote, StaffDialog } from './StaffDialog'
import { formatStaffAmount } from '../../utils/price'

interface TableResetDialogProps {
  tableLabel: string
  orderCount: number
  finalAmount: number
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** A12 — closes a visit without deleting its operational history. */
export function TableResetDialog({
  tableLabel,
  orderCount,
  finalAmount,
  submitting,
  onConfirm,
  onCancel,
}: TableResetDialogProps) {
  return (
    <StaffDialog
      title="테이블을 초기화할까요?"
      confirmLabel="테이블 초기화"
      confirmVariant="danger"
      submitting={submitting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <DialogSummary
        label="초기화 대상"
        table={tableLabel}
        meta={`주문 ${orderCount}건 · 미결제 ${formatStaffAmount(finalAmount)}`}
      />
      <ImpactNote title="초기화하면 이렇게 됩니다">
        미완료 손님 주문과 대기 중인 호출은 취소되고 현재 방문이 종료됩니다.
        주문·결제 이력과 서비스 주문, 테이블·QR 설정은 삭제되지 않습니다.
      </ImpactNote>
    </StaffDialog>
  )
}

