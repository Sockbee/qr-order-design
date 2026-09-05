import type { ButtonHTMLAttributes } from 'react'

type ButtonSize = 'small' | 'medium' | 'large' | 'xlarge'
type ButtonVariant = 'fill' | 'weak'

const SIZE_CLASSES: Record<ButtonSize, string> = {
  small: 'h-8 px-3 gap-1.5 rounded-btn-sm text-[14px] leading-[21px]',
  medium: 'h-[38px] px-4 gap-2 rounded-btn-md text-[15px] leading-[22px]',
  large: 'h-12 px-4 gap-2 rounded-btn-lg text-[15px] leading-[22px]',
  xlarge: 'h-14 px-5 gap-2.5 rounded-btn-xl text-[17px] leading-6',
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  fill: 'border-0 bg-primary text-on-primary enabled:active:bg-primary-pressed disabled:bg-surface disabled:text-muted',
  weak: 'border-[1.5px] border-border-strong bg-transparent text-strong enabled:active:bg-surface disabled:border-border-default disabled:text-muted',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: ButtonSize
  variant?: ButtonVariant
  /** Keeps the button width while the spinner shows. */
  loading?: boolean
  block?: boolean
  /** Count disc before the label; hidden at 0. */
  count?: number
  /** Trailing price; left-aligns the label. */
  amount?: string
}

export function Button({
  label,
  size = 'xlarge',
  variant = 'fill',
  loading = false,
  block = false,
  count,
  amount,
  disabled = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    block ? 'flex w-full' : 'inline-flex',
    'relative items-center justify-center font-bold cursor-pointer whitespace-nowrap select-none transition-[background-color,color,border-color,transform] duration-150 ease-out-soft enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:enabled:active:scale-100 disabled:cursor-default',
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const showCount = count !== undefined && count > 0

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          className="absolute size-5 rounded-full border-2 border-current border-t-transparent animate-spin-slow"
          aria-hidden="true"
        />
      )}
      <span
        className={`flex flex-1 min-w-0 items-center gap-[inherit] ${loading ? 'invisible' : ''}`}
      >
        {showCount && (
          <span className="flex-none inline-flex items-center justify-center size-6 rounded-full bg-badge text-badge-fg text-[13px] leading-none font-bold animate-pop-in motion-reduce:animate-none">
            {count}
          </span>
        )}
        <span className={`min-w-0 truncate ${amount ? 'flex-1 text-left' : 'flex-1 text-center'}`}>
          {label}
        </span>
        {amount && <span className="flex-none tracking-[-0.3px]">{amount}</span>}
      </span>
    </button>
  )
}
