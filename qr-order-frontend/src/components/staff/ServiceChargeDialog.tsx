import { ImpactNote, StaffDialog } from './StaffDialog'
import './OperationDialogs.css'
import { formatStaffAmount } from '../../utils/price'
import type { StaffServiceCharge } from '../../types/staff'

interface ServiceChargeDialogProps {
  tableId: string
  staffName: string
  serviceReason: string | null
  charge: StaffServiceCharge
  lineCount: number
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The confirm step before a service grant is written (§4.20).
 *
 * A03 deliberately has no confirm step — the draft panel is the confirmation
 * and every line stays editable. This screen does have one, because the
 * consequence is different in kind: it puts a named person on the hook for
 * money, and §4.18 makes the grant un-editable afterwards. Correcting it
 * means cancelling the order and re-granting.
 */
export function ServiceChargeDialog({
  tableId,
  staffName,
  serviceReason,
  charge,
  lineCount,
  submitting,
  onConfirm,
  onCancel,
}: ServiceChargeDialogProps) {
  const discountAmount = charge.grossAmount - charge.chargeAmount

  return (
    <StaffDialog
      title={`${tableId} 서비스 지급`}
      confirmLabel="서비스 지급"
      submitting={submitting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="operation-dialog__money">
        <p className="operation-dialog__money-row">
          <span>정가</span>
          <strong>{formatStaffAmount(charge.grossAmount)}</strong>
        </p>
        <p className="operation-dialog__money-row operation-dialog__money-row--discount">
          <span>{`스태프 할인 ${charge.discountRate}%`}</span>
          <strong>{`-${formatStaffAmount(discountAmount)}`}</strong>
        </p>
        <p className="operation-dialog__money-final">
          <span>{`${staffName} 부담액`}</span>
          <strong>{formatStaffAmount(charge.chargeAmount)}</strong>
        </p>
      </div>

      <ImpactNote title="이렇게 됩니다">
        {`${tableId} 청구서에는 ${lineCount}개 항목이 0원으로 올라가고, `}
        {`${formatStaffAmount(charge.chargeAmount)}은 ${staffName} 님의 미정산 금액에 `}
        {'더해집니다. 수금은 행사가 끝난 뒤 총무가 개인별로 한 번에 진행합니다. '}
        {'지급 후에는 수량과 항목을 수정할 수 없고, 정정하려면 주문을 취소하고 다시 '}
        {'지급해야 합니다.'}
        {serviceReason ? ` 사유: ${serviceReason}` : ''}
      </ImpactNote>
    </StaffDialog>
  )
}
