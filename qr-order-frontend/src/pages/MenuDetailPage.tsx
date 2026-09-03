import { useMemo, useState } from 'react'
import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { OptionGroup } from '../components/OptionGroup'
import { QuantitySelector } from '../components/customer/QuantitySelector'
import { formatPrice } from '../utils/price'
import type { CartLine, MenuItemDetail, MenuOption } from '../types/menu'

const QUANTITY_LABEL_ID = 'menu-detail-quantity'

interface MenuDetailPageProps {
  item: MenuItemDetail
  onBack: () => void
  onAddToCart: (line: CartLine) => void
  onCallStaff: () => void
}

/** Required groups sort above optional ones regardless of authored order. */
function sortGroups(groups: MenuItemDetail['optionGroups']) {
  return [...groups].sort(
    (a, b) => Number(b.required) - Number(a.required),
  )
}

function initialSelection(groups: MenuItemDetail['optionGroups']) {
  const selection: Record<string, MenuOption['id'][]> = {}
  for (const group of groups) {
    const availableOptionIds = new Set(
      group.options
        .filter((option) => !option.soldOut)
        .map((option) => option.id),
    )
    selection[group.id] = (group.defaultOptionIds ?? [])
      .filter((optionId) => availableOptionIds.has(optionId))
  }
  return selection
}

export function MenuDetailPage({
  item,
  onBack,
  onAddToCart,
  onCallStaff,
}: MenuDetailPageProps) {
  const groups = useMemo(
    () => sortGroups(item.optionGroups),
    [item.optionGroups],
  )
  const [selection, setSelection] = useState(() => initialSelection(groups))
  const [quantity, setQuantity] = useState(item.minQuantity ?? 1)

  const toggleOption = (groupId: string, optionId: MenuOption['id']) => {
    const group = groups.find((candidate) => candidate.id === groupId)
    if (!group) return

    setSelection((current) => {
      const selected = current[groupId] ?? []
      if (group.type === 'radio') {
        return { ...current, [groupId]: [optionId] }
      }
      return {
        ...current,
        [groupId]: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      }
    })
  }

  const selectedOptionIds = Object.values(selection).flat()

  const optionsTotal = groups.reduce((sum, group) => {
    const selected = selection[group.id] ?? []
    return (
      sum +
      group.options
        .filter((option) => selected.includes(option.id))
        .reduce((groupSum, option) => groupSum + option.priceDelta, 0)
    )
  }, 0)

  const unitPrice = item.price + optionsTotal
  const total = unitPrice * quantity

  // Incomplete required groups disable the action — never hide it
  // (UX-STRUCTURE §5.3).
  const canAdd = groups.every(
    (group) => {
      const count = (selection[group.id] ?? []).length
      return count >= (group.minSelections ?? (group.required ? 1 : 0)) &&
        count <= (group.maxSelections ?? Number.POSITIVE_INFINITY)
    },
  )

  const selectedOptionNames = groups.flatMap((group) => {
    const selected = selection[group.id] ?? []
    return group.options
      .filter((option) => selected.includes(option.id))
      .map((option) => option.label)
  })

  const originLine = [
    item.allergens?.length ? `알레르기: ${item.allergens.join(', ')}` : null,
    item.origin ? `원산지: ${item.origin}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col min-h-dvh bg-canvas">
      <AppBar
        title={item.name}
        onBack={onBack}
        actions={[{ label: '직원 호출', onClick: onCallStaff }]}
      />

      <div className="flex-none h-40 bg-surface overflow-hidden">
        {item.imageUrl && <img className="w-full h-full object-cover" src={item.imageUrl} alt="" />}
      </div>

      <main className="flex flex-1 flex-col gap-6 pt-4 px-4 pb-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 font-display font-normal text-[22px] leading-[33px] text-strong">
            <h2 className="flex-1 min-w-0">{item.name}</h2>
            <span className="flex-none whitespace-nowrap">
              {formatPrice(item.price)}
            </span>
          </div>
          <p className="text-sm leading-[21px] font-normal text-body">{item.description}</p>
          {originLine && (
            <p className="text-sm leading-[21px] font-normal text-body">{originLine}</p>
          )}
        </div>

        {groups.map((group) => (
          <OptionGroup
            key={group.id}
            group={group}
            selectedIds={selection[group.id] ?? []}
            onToggle={(optionId) => toggleOption(group.id, optionId)}
          />
        ))}

        <div className="flex items-center gap-2">
          <span
            className="flex-1 min-w-0 font-bold text-sm leading-[21px] text-strong"
            id={QUANTITY_LABEL_ID}
          >
            수량
          </span>
          <QuantitySelector
            value={quantity}
            onChange={setQuantity}
            min={item.minQuantity ?? 1}
            max={item.maxQuantity ?? 99}
            labelledBy={QUANTITY_LABEL_ID}
          />
        </div>
      </main>

      <div className="sticky bottom-0 z-[2] bg-canvas border-t border-border-default">
        <div className="flex p-4">
          <Button
            block
            size="xlarge"
            variant="fill"
            disabled={!canAdd}
            label={`담기 · ${formatPrice(total)}`}
            onClick={() =>
              onAddToCart({
                itemId: item.id,
                nameSnapshot: item.name,
                quantity,
                unitPrice,
                selectedOptionIds,
                selectedOptionNames,
              })
            }
          />
        </div>
        <div className="h-[var(--layout-safe-area)] bg-canvas" />
      </div>
    </div>
  )
}
