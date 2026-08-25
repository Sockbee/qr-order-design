import './QuantitySelector.css'

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
      className="quantity-selector"
      role="group"
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="quantity-selector__button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="수량 줄이기"
      >
        −
      </button>
      <span className="quantity-selector__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="quantity-selector__button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="수량 늘리기"
      >
        +
      </button>
    </div>
  )
}
