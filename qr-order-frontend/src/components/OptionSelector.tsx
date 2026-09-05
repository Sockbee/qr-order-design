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
  const active = selected && !disabled

  return (
    <label
      className={`flex items-center gap-3 w-full min-h-[52px] px-4 py-3 transition-colors duration-150 ease-out-soft motion-reduce:transition-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:-outline-offset-2 ${
        disabled
          ? 'cursor-default'
          : active
            ? 'bg-selected cursor-pointer'
            : 'cursor-pointer active:bg-selected'
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
      <span
        className={`flex-none flex items-center justify-center size-[22px] transition-colors duration-150 ease-out-soft motion-reduce:transition-none ${
          type === 'radio' ? 'rounded-full' : 'rounded-[6px]'
        } ${
          active
            ? 'bg-primary text-canvas'
            : `border-[1.5px] bg-transparent ${disabled ? 'border-border-default' : 'border-border-control'}`
        }`}
        aria-hidden="true"
      >
        {active &&
          (type === 'radio' ? (
            <span className="size-2 rounded-full bg-canvas" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))}
      </span>
      <span
        className={`flex-1 min-w-0 text-[15px] leading-[22px] ${
          disabled ? 'font-normal text-muted' : active ? 'font-bold text-link' : 'font-normal text-strong'
        }`}
      >
        {label}
        {disabled && ' (품절)'}
      </span>
      {/* Price is never text-muted (CLAUDE.md §6). */}
      <span
        className={`flex-none text-sm leading-[21px] font-medium whitespace-nowrap ${
          active ? 'text-link' : 'text-body'
        }`}
      >
        {formatPriceDelta(priceDelta)}
      </span>
    </label>
  )
}
