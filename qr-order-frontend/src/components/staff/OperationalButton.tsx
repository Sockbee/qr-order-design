import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './OperationalButton.css'

type Variant = 'primary' | 'secondary' | 'danger'

interface OperationalButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode
  variant?: Variant
  /**
   * A boolean, not a state: the label stays in place and the width never
   * changes, so the button does not jump under a thumb (DESIGN.md §4).
   */
  loading?: boolean
  size?: 'md' | 'lg'
  /** Full width, as the A09 submit button is drawn. */
  block?: boolean
}

/**
 * staff/PrimaryOperationalButton (84:29). Height 56 rather than the customer
 * app's 48 — operated standing, at arm's length, on the move.
 *
 * Danger is an outline, never filled red: #e42939 is reserved for real
 * failure and delay (DESIGN.md §7).
 */
export function OperationalButton({
  children,
  variant = 'primary',
  loading = false,
  size = 'lg',
  block = false,
  disabled,
  className,
  ...rest
}: OperationalButtonProps) {
  return (
    <button
      type="button"
      className={[
        'op-button',
        `op-button--${variant}`,
        `op-button--${size}`,
        loading ? 'op-button--loading' : '',
        block ? 'op-button--block' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="op-button__spinner" aria-hidden="true" />}
      <span className="op-button__label">{children}</span>
    </button>
  )
}
