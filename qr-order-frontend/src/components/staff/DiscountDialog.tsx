import { useState } from 'react'
import { StaffDialog } from './StaffDialog'
import './OperationDialogs.css'
import { formatStaffAmount } from '../../utils/price'

interface DiscountDialogProps {
  tableId: string
  subtotalAmount: number
  /** The single configured rate. §4.13 allows this or 0 — nothing else. */
  tableDiscountRate: number
  currentRate: number
  submitting: boolean
  onConfirm: (rate: number) => void
  onCancel: () => void
}

/**
 * A07 — Apply Discount (95:1418). Two options only: off, or the one
 * configured table rate. This is deliberately not a coupon engine (§4.13),
 * and orders added after the discount are covered because the amount is
 * computed at read time.
 */
export function DiscountDialog({
  tableId,
  subtotalAmount,
  tableDiscountRate,
  currentRate,
  submitting,
  onConfirm,
  onCancel,
}: DiscountDialogProps) {
  const [rate, setRate] = useState(currentRate)
  const discountAmount = Math.floor((subtotalAmount * rate) / 100)

  const options = [
    { value: 0, title: '할인 없음', body: '정가로 결제합니다' },
    {
      value: tableDiscountRate,
      title: `${tableDiscountRate}% 테이블 할인`,
      body: '지정 테이블 대상 할인',
    },
  ]

  return (
    <StaffDialog
      title={`${tableId} 할인 적용`}
      confirmLabel="할인 적용"
      submitting={submitting}
      onConfirm={() => onConfirm(rate)}
      onCancel={onCancel}
    >
      <div className="operation-dialog__options" role="radiogroup" aria-label="할인">
        {options.map((option) => {
          const selected = option.value === rate
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`operation-dialog__option${
                selected ? ' operation-dialog__option--selected' : ''
              }`}
              onClick={() => setRate(option.value)}
            >
              <span className="operation-dialog__radio" aria-hidden="true" />
              <span className="operation-dialog__option-text">
                <span className="operation-dialog__option-title">
                  {option.title}
                </span>
                <span className="operation-dialog__option-body">
                  {option.body}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="operation-dialog__money">
        <p className="operation-dialog__money-row">
          <span>주문금액</span>
          <strong>{formatStaffAmount(subtotalAmount)}</strong>
        </p>
        {rate > 0 && (
          <p className="operation-dialog__money-row operation-dialog__money-row--discount">
            <span>{`${rate}% 할인`}</span>
            <strong>{`-${formatStaffAmount(discountAmount)}`}</strong>
          </p>
        )}
        <p className="operation-dialog__money-final">
          <span>결제 금액</span>
          <strong>{formatStaffAmount(subtotalAmount - discountAmount)}</strong>
        </p>
      </div>
    </StaffDialog>
  )
}
