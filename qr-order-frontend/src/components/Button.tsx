import type { ButtonHTMLAttributes } from 'react'
import spinnerIcon from '../assets/spinner.svg'
import './Button.css'

type ButtonSize = 'small' | 'medium' | 'large' | 'xlarge'
type ButtonVariant = 'fill' | 'weak'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: ButtonSize
  variant?: ButtonVariant
  /**
   * Loading is a boolean, not a state: it is orthogonal to pressed/disabled
   * and preserves the button width (DESIGN.md §4).
   */
  loading?: boolean
  block?: boolean
}

export function Button({
  label,
  size = 'xlarge',
  variant = 'fill',
  loading = false,
  block = false,
  disabled = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    'button',
    `button--${size}`,
    `button--${variant}`,
    block && 'button--block',
    loading && 'button--loading',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <img className="button__spinner" src={spinnerIcon} alt="" />}
      <span className="button__label">{label}</span>
    </button>
  )
}
