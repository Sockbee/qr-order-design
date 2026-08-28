import './StaffInlineAlert.css'
import { OperationalButton } from './OperationalButton'

interface StaffInlineAlertProps {
  title: string
  detail: string
  /**
   * `info` is the calm blue used when nothing is broken — an expired session
   * is expected after 14 hours, not a failure (A09 states, 114:1828).
   */
  tone?: 'danger' | 'info'
  actionLabel?: string
  onAction?: () => void
}

/**
 * FailureAlert (99:1551). A failure has to say all three things at once: what
 * failed, that the previous state is intact, and whether a retry is possible.
 * The action is a secondary outline button — filled red is not used for a
 * recoverable error (DESIGN.md §7).
 */
export function StaffInlineAlert({
  title,
  detail,
  tone = 'danger',
  actionLabel,
  onAction,
}: StaffInlineAlertProps) {
  return (
    <div className={`staff-alert staff-alert--${tone}`} role="alert">
      <div className="staff-alert__info">
        <p className="staff-alert__title">{title}</p>
        <p className="staff-alert__detail">{detail}</p>
      </div>
      {actionLabel && onAction && (
        <OperationalButton variant="secondary" onClick={onAction}>
          {actionLabel}
        </OperationalButton>
      )}
    </div>
  )
}
