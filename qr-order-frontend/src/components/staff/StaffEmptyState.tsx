import './StaffEmptyState.css'

/**
 * staff/EmptyState (86:25). An empty screen is a normal operating state, not
 * a failure — say calmly what happens next.
 */
export function StaffEmptyState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="staff-empty">
      <p className="staff-empty__title">{title}</p>
      <p className="staff-empty__body">{body}</p>
    </div>
  )
}
