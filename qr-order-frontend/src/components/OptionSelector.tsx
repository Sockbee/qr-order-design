import radioSelected from '../assets/radio-selected.svg'
import radioUnselected from '../assets/radio-unselected.svg'
import { formatPriceDelta } from '../utils/price'
import './OptionSelector.css'

interface OptionSelectorProps {
  type: 'radio' | 'check'
  label: string
  priceDelta: number
  selected: boolean
  disabled?: boolean
  /** Shared name for the radio inputs belonging to one group. */
  name: string
  onSelect: () => void
}

export function OptionSelector({
  type,
  label,
  priceDelta,
  selected,
  disabled = false,
  name,
  onSelect,
}: OptionSelectorProps) {
  const classes = [
    'option-selector',
    selected && 'option-selector--selected',
    disabled && 'option-selector--disabled',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes}>
      <input
        className="option-selector__input"
        type={type === 'radio' ? 'radio' : 'checkbox'}
        name={name}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="option-selector__control" aria-hidden="true">
        {type === 'radio' ? (
          <img src={selected ? radioSelected : radioUnselected} alt="" />
        ) : (
          <span className="option-selector__box">{selected && '✓'}</span>
        )}
      </span>
      <span className="option-selector__label">
        {label}
        {disabled && ' (품절)'}
      </span>
      <span className="option-selector__price">
        {formatPriceDelta(priceDelta)}
      </span>
    </label>
  )
}
