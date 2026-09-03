import './SettlementCard.css'
import { OperationalButton } from './OperationalButton'
import { SettlementStatusBadge } from './SettlementStatusBadge'
import { formatStaffAmount } from '../../utils/price'
import type { StaffSettlement } from '../../types/staff'

interface SettlementCardProps {
  member: StaffSettlement
  onOpen: (staffId: string) => void
}

/**
 * One staff member in the B04 settlement queue.
 *
 * Deliberately the same shape as `PaymentOrderCard`: 342px, a money
 * breakdown, one action. The treasurer works both screens the same way —
 * check a figure, collect, record — so they should not need two mental
 * models.
 *
 * The money the treasurer actually collects is 부담액, which is why that is
 * the metric-sized figure and 정가 is a caption above it.
 */
export function SettlementCard({ member, onOpen }: SettlementCardProps) {
  /*
   * §4.21: a settled member whose recomputed charge no longer matches the
   * snapshot means an order was corrected after the money changed hands.
   * Silence here would leave a real discrepancy invisible.
   */
  const drifted =
    member.settled &&
    member.settledAmount !== null &&
    member.settledAmount !== member.chargeAmount

  return (
    <article className="settlement-card" aria-label={`${member.name} 정산`}>
      <header className="settlement-card__head">
        <div className="settlement-card__who">
          <h3 className="settlement-card__name">{member.name}</h3>
          {member.affiliation && (
            <p className="settlement-card__affiliation">{member.affiliation}</p>
          )}
        </div>
        <SettlementStatusBadge settled={member.settled} />
      </header>

      <div className="settlement-card__money">
        <p className="settlement-card__row">
          <span>{`서비스 ${member.serviceOrderCount}건 정가`}</span>
          <strong>{formatStaffAmount(member.grossAmount)}</strong>
        </p>
        <p className="settlement-card__final">
          <span>{member.settled ? '수금액' : '부담액'}</span>
          <strong>
            {formatStaffAmount(
              member.settled && member.settledAmount !== null
                ? member.settledAmount
                : member.chargeAmount,
            )}
          </strong>
        </p>
      </div>

      {drifted && (
        <p className="settlement-card__drift" role="status">
          {`정산 후 주문이 정정되어 현재 합계는 ${formatStaffAmount(
            member.chargeAmount,
          )}입니다`}
        </p>
      )}

      <OperationalButton
        block
        variant={member.settled ? 'secondary' : 'primary'}
        onClick={() => onOpen(member.staffId)}
      >
        {member.settled ? '내역 보기' : '내역 확인 · 수금'}
      </OperationalButton>
    </article>
  )
}
