import type { ButtonHTMLAttributes } from 'react'
import spinnerIcon from '../assets/spinner.svg'

type ButtonSize = 'small' | 'medium' | 'large' | 'xlarge'
type ButtonVariant = 'fill' | 'weak'

/*
 * TDS Mobile Button — DESIGN.md §4 (verified).
 * Size ladder: Small 32/r8 · Medium 38/r10 · Large 48/r14 · XLarge 56/r16.
 * XLarge padding 0 20 is verified component geometry and is deliberately not
 * bound to the spacing scale (20 is not in the verified cluster).
 */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  small: 'h-8 px-3 rounded-btn-sm text-[14px] leading-[21px]',
  medium: 'h-[38px] px-4 rounded-btn-md text-[15px] leading-[22px]',
  large: 'h-12 px-4 rounded-btn-lg text-[15px] leading-[22px]',
  xlarge: 'h-14 px-5 rounded-btn-xl text-[17px] leading-6',
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  fill: 'bg-primary text-on-primary enabled:active:bg-primary-pressed',
  weak: 'bg-weak text-link enabled:active:bg-surface',
}

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
    block ? 'flex w-full' : 'inline-flex',
    'relative items-center justify-center gap-2 border-0 font-bold cursor-pointer whitespace-nowrap transition-colors duration-[160ms] ease-out motion-reduce:transition-none',
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    'disabled:bg-surface disabled:text-muted disabled:cursor-default',
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
      {loading && (
        <img
          className="absolute w-5 h-5 animate-spin-slow"
          src={spinnerIcon}
          alt=""
        />
      )}
      <span className={loading ? 'invisible' : ''}>{label}</span>
    </button>
  )
}
