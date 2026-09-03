interface QuantitySelectorProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** id of the row label describing what is being counted. */
  labelledBy?: string
  /** Used instead of `labelledBy` when there is no label element to point at. */
  ariaLabel?: string
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
  labelledBy,
  ariaLabel,
}: QuantitySelectorProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="relative flex items-center justify-center w-8 h-8 border-0 rounded-btn-sm bg-surface text-base leading-6 font-bold text-body cursor-pointer disabled:text-muted disabled:cursor-default before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:w-12 before:h-12 before:-translate-x-1/2 before:-translate-y-1/2"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="수량 줄이기"
      >
        −
      </button>
      <span
        className="w-10 text-center text-base leading-6 font-bold text-strong"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className="relative flex items-center justify-center w-8 h-8 border-0 rounded-btn-sm bg-surface text-base leading-6 font-bold text-body cursor-pointer disabled:text-muted disabled:cursor-default before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:w-12 before:h-12 before:-translate-x-1/2 before:-translate-y-1/2"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="수량 늘리기"
      >
        +
      </button>
    </div>
  )
}
