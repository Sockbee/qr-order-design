import { ImpactNote, StaffDialog } from './StaffDialog'
import './SettlementDialog.css'
import './OperationDialogs.css'
import { formatStaffAmount } from '../../utils/price'
import type { StaffSettlement } from '../../types/staff'

interface SettlementDialogProps {
  member: StaffSettlement
  submitting: boolean
  onConfirm: (staffId: string, expectedChargeAmount: number) => void
  onCancel: () => void
}

function formatGrantTime(iso: string): string {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return '—'
  return new Date(parsed).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * The per-staff detail B03 has no room for, plus the collect action itself
 * (§4.22).
 *
 * B03 is a card grid with no inspector pane, so rather than invent a second
 * shell this reuses the wide operation dialog — the same surface A04–A07
 * already use for "read the consequence, then confirm".
 *
 * The confirm sends `expectedChargeAmount`, so a grant added while this
 * dialog was open is rejected as `SETTLEMENT_AMOUNT_CHANGED` rather than
 * quietly collecting the wrong figure.
 */
export function SettlementDialog({
  member,
  submitting,
  onConfirm,
  onCancel,
}: SettlementDialogProps) {
  const discountAmount = member.grossAmount - member.chargeAmount

  return (
    <StaffDialog
      title={`${member.name} 서비스 정산`}
      confirmLabel={member.settled ? '확인' : '수금 완료'}
      confirmDisabled={!member.settled && member.serviceOrderCount === 0}
      submitting={submitting}
      onConfirm={() =>
        member.settled
          ? onCancel()
          : onConfirm(member.staffId, member.chargeAmount)
      }
      onCancel={onCancel}
    >
      {member.orders.length === 0 ? (
        <p className="staff-dialog__body">
          아직 이 인원이 지급한 서비스가 없습니다. 수금할 금액도 없습니다.
        </p>
      ) : (
        <div className="settlement-dialog__list">
          <div className="settlement-dialog__head" aria-hidden="true">
            <span>주문</span>
            <span>테이블</span>
            <span>메시지</span>
            <span>정가</span>
            <span>부담액</span>
          </div>
          <ul className="settlement-dialog__rows">
            {member.orders.map((order) => (
              <li key={order.orderId} className="settlement-dialog__row">
                <span className="settlement-dialog__code">
                  {order.displayCode}
                  <span className="settlement-dialog__time">
                    {formatGrantTime(order.createdAt)}
                  </span>
                </span>
                <span>{order.tableId}</span>
                <span className="settlement-dialog__message">
                  {order.serviceMessage ?? '—'}
                </span>
                <span className="settlement-dialog__amount">
                  {formatStaffAmount(order.grossAmount)}
                </span>
                <span className="settlement-dialog__amount settlement-dialog__amount--strong">
                  {formatStaffAmount(order.chargeAmount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="operation-dialog__money">
        <p className="operation-dialog__money-row">
          <span>{`서비스 ${member.serviceOrderCount}건 정가`}</span>
          <strong>{formatStaffAmount(member.grossAmount)}</strong>
        </p>
        <p className="operation-dialog__money-row operation-dialog__money-row--discount">
          <span>스태프 할인</span>
          <strong>{`-${formatStaffAmount(discountAmount)}`}</strong>
        </p>
        <p className="operation-dialog__money-final">
          <span>수금할 금액</span>
          <strong>{formatStaffAmount(member.chargeAmount)}</strong>
        </p>
      </div>

      {member.settled ? (
        <ImpactNote title="정산 완료">
          {`${formatStaffAmount(member.settledAmount ?? member.chargeAmount)}을 수금한 것으로 기록되어 있습니다. `}
          {'금액을 정정하려면 정산을 되돌린 뒤 다시 확정해야 합니다.'}
        </ImpactNote>
      ) : (
        <ImpactNote title="이렇게 됩니다">
          {`${member.name} 님에게 ${formatStaffAmount(member.chargeAmount)}을 받은 것으로 기록됩니다. `}
          {'정산은 인원당 한 번이며 부분 수금은 지원하지 않습니다. '}
          {'테이블 청구와는 별개 장부라 손님 결제 상태는 바뀌지 않습니다.'}
        </ImpactNote>
      )}
    </StaffDialog>
  )
}
