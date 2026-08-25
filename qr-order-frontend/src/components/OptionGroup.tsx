import { Badge } from './Badge'
import { OptionSelector } from './OptionSelector'
import type { MenuOption, MenuOptionGroup } from '../types/menu'
import './OptionGroup.css'

interface OptionGroupProps {
  group: MenuOptionGroup
  selectedIds: MenuOption['id'][]
  onToggle: (optionId: MenuOption['id']) => void
}

export function OptionGroup({
  group,
  selectedIds,
  onToggle,
}: OptionGroupProps) {
  const { id, label, required, type, options, maxSelections } = group
  const maxReached =
    maxSelections !== undefined && selectedIds.length >= maxSelections

  return (
    <section className="option-group" aria-labelledby={`option-group-${id}`}>
      <div className="option-group__head">
        <h3 className="option-group__label" id={`option-group-${id}`}>
          {label}
        </h3>
        <Badge size="small" tone={required ? 'weak' : 'neutral'}>
          {required ? '필수' : '선택'}
        </Badge>
      </div>

      <div className="option-group__options">
        {options.map((option) => {
          const selected = selectedIds.includes(option.id)
          return (
            <OptionSelector
              key={option.id}
              type={type}
              name={`option-group-${id}`}
              label={option.label}
              priceDelta={option.priceDelta}
              selected={selected}
              // Max-reached greys out the remaining unselected rows
              // (UX-STRUCTURE §5.3).
              disabled={option.soldOut || (maxReached && !selected)}
              onSelect={() => onToggle(option.id)}
            />
          )
        })}
      </div>

      {maxReached && (
        <p className="option-group__hint">최대 {maxSelections}개까지 선택할 수 있어요.</p>
      )}
    </section>
  )
}
