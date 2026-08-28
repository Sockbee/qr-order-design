import './PaymentOrderCard.css'
import { OperationalButton } from './OperationalButton'
import { TableStatusBadge } from './TableStatusBadge'
import { formatStaffAmount } from '../../utils/price'
import type { StaffPaymentOrder } from '../../types/staff'

interface PaymentOrderCardProps {
  order: StaffPaymentOrder
  busy: boolean
  onConfirm: (tableId: string, expectedFinalAmount: number) => void
}

/**
 * staff/PaymentOrderCard (B03). Unlike the kitchen card this one is *all*
 * money: the breakdown is what the operator checks against the bank app
 * before recording that the transfer arrived. The app never processes a
 * payment (§4.17) — it records that one was seen.
 */
export function PaymentOrderCard({
  order,
  busy,
  onConfirm,
}: PaymentOrderCardProps) {
  const { bill } = order

  return (
    <article className="payment-card" aria-label={`${order.tableId} 결제`}>
      <header className="payment-card__head">
        <h3 className="payment-card__table">{order.tableId}</h3>
        <TableStatusBadge status={bill.paid ? 'paid' : 'unpaid'} />
      </header>

      <div className="payment-card__money">
        <p className="payment-card__row">
          <span>주문금액</span>
          <strong>{formatStaffAmount(bill.subtotalAmount)}</strong>
        </p>
        {bill.discountRate > 0 && (
          <p className="payment-card__row payment-card__row--discount">
            <span>{`${bill.discountRate}% 할인`}</span>
            <strong>{`-${formatStaffAmount(bill.discountAmount)}`}</strong>
          </p>
        )}
        <p className="payment-card__final">
          <span>결제 금액</span>
          <strong>{formatStaffAmount(bill.finalAmount)}</strong>
        </p>
      </div>

      {order.minutesSinceServed !== null && (
        <p className="payment-card__waited">
          {`서빙 완료 후 ${order.minutesSinceServed}분`}
        </p>
      )}

      <OperationalButton
        block
        variant={bill.paid ? 'secondary' : 'primary'}
        disabled={bill.paid}
        loading={busy}
        onClick={() => onConfirm(order.tableId, bill.finalAmount)}
      >
        {bill.paid ? '결제 완료' : busy ? '확인 중' : '입금 확인'}
      </OperationalButton>
    </article>
  )
}
