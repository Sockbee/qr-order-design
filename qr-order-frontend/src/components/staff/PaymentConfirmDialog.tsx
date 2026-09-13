import { useRef, useState } from 'react'
import { StaffDialog } from './StaffDialog'
import { formatStaffAmount } from '../../utils/price'
import './OperationDialogs.css'
import './PaymentOrderCard.css'

export function PaymentConfirmDialog({ tableId, amount, submitting, onCancel, onConfirm }: {
  tableId: string
  amount: number
  submitting: boolean
  onCancel: () => void
  onConfirm: (payerName: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const submit = async () => {
    if (!name.trim() || submitting || saving.current) return
    saving.current = true
    setError(null)
    try { await onConfirm(name.trim()) }
    catch (caught) { setError(caught instanceof Error ? caught.message : '입금 기록을 저장하지 못했어요. 다시 시도해 주세요.') }
    finally { saving.current = false }
  }
  return <StaffDialog title={`${tableId} 입금 확인`} size="narrow" confirmLabel="기록하고 입금 확인"
    submitting={submitting} confirmDisabled={!name.trim()} onConfirm={() => void submit()} onCancel={onCancel}>
    <p className="staff-dialog__body">결제 금액 {formatStaffAmount(amount)}<br />통장 입금 내역을 확인한 뒤 입금자명을 기록해 주세요.</p>
    <label className="operation-dialog__field">
      <span className="operation-dialog__label">입금자명 *</span>
      <input className="payment-payer-input" required maxLength={100} value={name} disabled={submitting}
        placeholder="입금자명을 입력해 주세요" onChange={(event) => setName(event.target.value)} />
    </label>
    <p className="operation-dialog__helper">통장에 표시된 이름을 그대로 입력해 주세요.</p>
    {error && <p role="alert" className="payment-payer-error">{error}</p>}
  </StaffDialog>
}
