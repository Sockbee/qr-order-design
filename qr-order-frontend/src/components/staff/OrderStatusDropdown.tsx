import { useEffect, useRef, useState } from 'react'
import './OrderStatusDropdown.css'
import {
  STAFF_ORDER_STATUS_LABELS,
  type StaffOrderStatus,
} from '../../types/staff'

const STATUSES: StaffOrderStatus[] = [
  'new',
  'cooking',
  'ready',
  'served',
  'unpaid',
  'paid',
]

interface OrderStatusDropdownProps {
  value: StaffOrderStatus
  /** Updating keeps the old label; success reflects the new one immediately. */
  phase?: 'idle' | 'updating' | 'success'
  disabled?: boolean
  onChange: (status: StaffOrderStatus) => void
}

/**
 * staff/OrderStatusDropdown (83:47). The control that changes the shared
 * six-step status — the most-used control in the app.
 *
 * Sequential transitions are not enforced: 조리 중 → 서빙 완료 has to be one
 * move, because correcting a mistake is the common case. Option rows are 56px
 * for arm's-length use, and the list sits 8px below the control so a stray
 * tap does not land on the wrong row. No shadow (DESIGN.md §6) — the list is
 * separated by a 1px border and radius.
 */
export function OrderStatusDropdown({
  value,
  phase = 'idle',
  disabled = false,
  onChange,
}: OrderStatusDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const locked = disabled || phase === 'updating'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const state = locked
    ? disabled
      ? 'disabled'
      : 'updating'
    : phase === 'success'
      ? 'success'
      : open
        ? 'open'
        : 'idle'

  return (
    <div
      ref={rootRef}
      className={`status-dropdown status-dropdown--${state}`}
    >
      <button
        type="button"
        className={`status-dropdown__control${
          state === 'idle' || state === 'open'
            ? ` status-dropdown__control--${value}`
            : ''
        }`}
        disabled={locked}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`주문 상태: ${STAFF_ORDER_STATUS_LABELS[value]}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="status-dropdown__dot" aria-hidden="true" />
        <span className="status-dropdown__label">
          {STAFF_ORDER_STATUS_LABELS[value]}
        </span>
        {phase === 'updating' && (
          <span className="status-dropdown__spinner" aria-hidden="true" />
        )}
        {phase === 'success' && (
          <span className="status-dropdown__check" aria-hidden="true">
            ✓
          </span>
        )}
        {phase === 'idle' && (
          <span className="status-dropdown__caret" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        )}
      </button>

      {open && !locked && (
        <ul className="status-dropdown__options" role="listbox">
          {STATUSES.map((status) => {
            const selected = status === value
            return (
              <li key={status} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`status-dropdown__option${
                    selected
                      ? ` status-dropdown__option--selected status-dropdown__option--${status}`
                      : ''
                  }`}
                  onClick={() => {
                    setOpen(false)
                    if (!selected) onChange(status)
                  }}
                >
                  <span
                    className={`status-dropdown__dot status-dropdown__dot--${status}`}
                    aria-hidden="true"
                  />
                  <span className="status-dropdown__label">
                    {STAFF_ORDER_STATUS_LABELS[status]}
                  </span>
                  {selected && (
                    <span className="status-dropdown__check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
