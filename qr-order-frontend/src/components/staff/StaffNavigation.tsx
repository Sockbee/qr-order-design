import { NavLink } from 'react-router-dom'
import './StaffNavigation.css'

export interface StaffNavItem {
  label: string
  /** Null while that screen is not built — the item renders inert. */
  to: string | null
  /** Null when the count has no data source yet. */
  count: number | null
  /** Renders the count in the attention tint instead of the neutral one. */
  attention?: boolean
}

function Count({ item }: { item: StaffNavItem }) {
  if (item.count === null) return null
  const attention = item.attention && item.count > 0
  return (
    <span
      className={`staff-nav__count${attention ? ' staff-nav__count--attention' : ''}`}
    >
      {item.count}
    </span>
  )
}

/**
 * staff/StaffNavigation (84:90). A left rail rather than a top bar: it spends
 * 88px of width and no height at all, and height is exactly what the table
 * grid needs.
 *
 * Labels only, no icons — icon-only critical controls are not allowed.
 * Settings and account are deliberately outside the main workflow.
 *
 * The 테이블 badge counts tables that *need attention* — calls plus delays —
 * not simply how many tables are active.
 */
export function StaffNavigation({ items }: { items: StaffNavItem[] }) {
  return (
    <nav className="staff-nav" aria-label="운영 메뉴">
      <ul className="staff-nav__list">
        {items.map((item) => (
          <li key={item.label}>
            {item.to ? (
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `staff-nav__item${isActive ? ' staff-nav__item--active' : ''}`
                }
              >
                <span className="staff-nav__label">{item.label}</span>
                <Count item={item} />
              </NavLink>
            ) : (
              <span
                className="staff-nav__item staff-nav__item--pending"
                aria-disabled="true"
                title="아직 준비 중인 화면입니다"
              >
                <span className="staff-nav__label">{item.label}</span>
                <Count item={item} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
