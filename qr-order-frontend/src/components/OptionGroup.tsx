import { Badge } from './Badge'
import { OptionSelector } from './OptionSelector'
import type { MenuOption, MenuOptionGroup } from '../types/menu'

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
    <section className="flex flex-col gap-2.5 w-full" aria-labelledby={`option-group-${id}`}>
      <div className="flex items-center gap-2 w-full">
        <h3
          className="flex-1 min-w-0 font-bold text-[15px] leading-[22px] text-strong"
          id={`option-group-${id}`}
        >
          {label}
        </h3>
        <Badge size="small" tone={required ? 'weak' : 'outline'}>
          {required ? '필수' : '선택'}
        </Badge>
      </div>

      <div className="flex flex-col rounded-btn-xl bg-surface overflow-hidden divide-y divide-dashed divide-border-default">
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
        <p className="text-[13px] leading-[19px] font-normal text-body">
          최대 {maxSelections}개까지 선택할 수 있어요.
        </p>
      )}
    </section>
  )
}
