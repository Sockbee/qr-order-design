import './CallRow.css'
import { OperationalButton } from './OperationalButton'
import { callReasonLabel } from '../../types/call'
import type { StaffCallGroup } from '../../types/staff'

interface CallRowProps {
  group: StaffCallGroup
  /** Ticked by the page clock — reading it here would be impure. */
  now: number
  acknowledging: boolean
  onAcknowledge: (tableId: string) => void
}

function minutesSince(isoTimestamp: string, now: number): number {
  const parsed = Date.parse(isoTimestamp)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.floor((now - parsed) / 60_000))
}

function describeElapsed(group: StaffCallGroup, now: number): string {
  if (group.acknowledged) return '확인함 · 방금'

  // Dated from the group's oldest call — the time the diner actually waited.
  const first = minutesSince(group.firstCalledAt, now)
  const firstLabel = first < 1 ? '방금' : `${first}분 전`
  if (group.count <= 1) return `${firstLabel} 호출`

  const last = minutesSince(group.lastCalledAt, now)
  const lastLabel = last < 1 ? '방금' : `${last}분 전`
  return `${firstLabel} 첫 호출 · ${lastLabel} 재호출`
}

/**
 * staff/CallRow (106:124). The receiving end of the customer's 직원 호출.
 *
 * Calls get no view of their own: the table is the primary object, so the
 * strip sits on top of the table home. The reason is always shown — who walks
 * over depends on whether it is 물·수저 or 결제 요청.
 *
 * Acknowledging is reversible, so it does not go through a ConfirmDialog.
 */
export function CallRow({
  group,
  now,
  acknowledging,
  onAcknowledge,
}: CallRowProps) {
  const reason = group.reasons.map(callReasonLabel).join(' · ')
  const state = group.acknowledged ? 'acknowledged' : 'new'

  return (
    <li className={`call-row call-row--${state}`}>
      <span className="call-row__table">{group.tableId}</span>
      {group.count > 1 && (
        /* Solid, not a tint — urgency rises without a new alarm colour. */
        <span className="call-row__repeat">{group.count}회</span>
      )}
      <span className="call-row__info">
        <span className="call-row__reason">{reason}</span>
        <span className="call-row__elapsed">
          {describeElapsed(group, now)}
        </span>
      </span>
      {group.acknowledged ? (
        <span className="call-row__done">✓ 확인됨</span>
      ) : (
        <OperationalButton
          size="md"
          loading={acknowledging}
          onClick={() => onAcknowledge(group.tableId)}
          aria-label={`${group.displayName} 호출 확인`}
        >
          확인
        </OperationalButton>
      )}
    </li>
  )
}
