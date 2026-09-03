import radioSelected from '../assets/radio-selected.svg'
import radioUnselected from '../assets/radio-unselected.svg'
import { formatPriceDelta } from '../utils/price'

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
  const textColor = disabled ? 'text-muted' : selected ? 'text-link' : 'text-strong'

  return (
    <label
      className={`flex items-center gap-3 w-full pt-3.5 px-4 pb-3.5 rounded-row cursor-pointer outline outline-1 outline-offset-[-1px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-offset-2 ${
        disabled
          ? 'bg-surface outline-border-default cursor-default'
          : selected
            ? 'bg-weak outline-border-selected'
            : 'bg-canvas outline-border-default active:bg-surface'
      }`}
    >
      <input
        className="sr-only"
        type={type === 'radio' ? 'radio' : 'checkbox'}
        name={name}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="relative flex-none w-6 h-6" aria-hidden="true">
        {type === 'radio' ? (
          <img
            className="w-full h-full"
            src={selected ? radioSelected : radioUnselected}
            alt=""
          />
        ) : (
          <span
            className={`absolute top-px left-px flex items-center justify-center w-[22px] h-[22px] border-[1.5px] rounded-[6px] text-sm leading-[21px] font-bold ${
              selected
                ? 'border-primary bg-primary text-on-primary'
                : 'border-border-default'
            }`}
          >
            {selected && '✓'}
          </span>
        )}
      </span>
      <span className={`flex-1 min-w-0 text-base leading-6 font-normal ${textColor}`}>
        {label}
        {disabled && ' (품절)'}
      </span>
      <span className={`flex-none text-sm leading-[21px] font-bold whitespace-nowrap ${textColor}`}>
        {formatPriceDelta(priceDelta)}
      </span>
    </label>
  )
}
