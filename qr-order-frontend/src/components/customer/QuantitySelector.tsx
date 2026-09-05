interface QuantitySelectorProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** id of the row label describing what is being counted. */
  labelledBy?: string
  /** Used instead of `labelledBy` when there is no label element to point at. */
  ariaLabel?: string
  /** `large` sits beside the 담기 button (S04); `small` lives inside a cart line. */
  size?: 'small' | 'large'
}

const SIZE_CLASSES = {
  small: {
    frame: 'h-9 rounded-btn-md',
    button: 'w-9',
    value: 'min-w-7 text-[15px] leading-[22px]',
    icon: 16,
  },
  large: {
    frame: 'h-14 rounded-btn-xl',
    button: 'w-[46px]',
    value: 'min-w-6 text-[17px] leading-6',
    icon: 20,
  },
} as const

const BUTTON_CLASSES =
  "relative flex items-center justify-center h-full flex-none rounded-[inherit] border-0 bg-transparent text-strong cursor-pointer transition-colors duration-150 ease-out-soft motion-reduce:transition-none enabled:active:bg-surface disabled:text-muted disabled:cursor-default before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:size-12 before:-translate-x-1/2 before:-translate-y-1/2"

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
  labelledBy,
  ariaLabel,
  size = 'small',
}: QuantitySelectorProps) {
  const classes = SIZE_CLASSES[size]

  return (
    <div
      className={`inline-flex flex-none items-center border-[1.5px] border-border-strong bg-transparent ${classes.frame}`}
      role="group"
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`${BUTTON_CLASSES} ${classes.button}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="수량 줄이기"
      >
        <svg
          width={classes.icon}
          height={classes.icon}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <span
        className={`text-center font-bold text-strong ${classes.value}`}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={`${BUTTON_CLASSES} ${classes.button}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="수량 늘리기"
      >
        <svg
          width={classes.icon}
          height={classes.icon}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
