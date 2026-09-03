import './SettlementStatusBadge.css'

/**
 * 미정산 / 정산 완료.
 *
 * Not folded into `TableStatusBadge`: that component is keyed to the six
 * `StaffOrderStatus` steps whose `unpaid`/`paid` labels read 결제 대기 /
 * 결제 완료. Settlement is a different axis — the staff member's debt, not
 * the table's bill — and reusing the enum would have repainted A02's labels.
 *
 * The colour tokens *are* reused, so the two badges still look related.
 */
export function SettlementStatusBadge({ settled }: { settled: boolean }) {
  return (
    <span
      className={`settlement-badge settlement-badge--${
        settled ? 'settled' : 'unsettled'
      }`}
    >
      <span className="settlement-badge__dot" aria-hidden="true" />
      {settled ? '정산 완료' : '미정산'}
    </span>
  )
}
