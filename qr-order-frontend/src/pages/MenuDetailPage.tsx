import { useMemo, useState } from 'react'
import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { OptionGroup } from '../components/OptionGroup'
import { QuantitySelector } from '../components/QuantitySelector'
import { formatPrice } from '../utils/price'
import type { CartLine, MenuItemDetail, MenuOption } from '../types/menu'
import './MenuDetailPage.css'

const QUANTITY_LABEL_ID = 'menu-detail-quantity'

interface MenuDetailPageProps {
  item: MenuItemDetail
  onBack: () => void
  onAddToCart: (line: CartLine) => void
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
    selection[group.id] = group.defaultOptionIds ?? []
  }
  return selection
}

export function MenuDetailPage({
  item,
  onBack,
  onAddToCart,
}: MenuDetailPageProps) {
  const groups = useMemo(
    () => sortGroups(item.optionGroups),
    [item.optionGroups],
  )
  const [selection, setSelection] = useState(() => initialSelection(groups))
  const [quantity, setQuantity] = useState(1)

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
    (group) => !group.required || (selection[group.id] ?? []).length > 0,
  )

  const originLine = [
    item.allergens?.length ? `알레르기: ${item.allergens.join(', ')}` : null,
    item.origin ? `원산지: ${item.origin}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="menu-detail">
      <AppBar title={item.name} onBack={onBack} />

      <div className="menu-detail__hero">
        {item.imageUrl && <img src={item.imageUrl} alt="" />}
      </div>

      <main className="menu-detail__content">
        <div className="menu-detail__head">
          <div className="menu-detail__name-row">
            <h2 className="menu-detail__name">{item.name}</h2>
            <span className="menu-detail__price">
              {formatPrice(item.price)}
            </span>
          </div>
          <p className="menu-detail__description">{item.description}</p>
          {originLine && <p className="menu-detail__origin">{originLine}</p>}
        </div>

        {groups.map((group) => (
          <OptionGroup
            key={group.id}
            group={group}
            selectedIds={selection[group.id] ?? []}
            onToggle={(optionId) => toggleOption(group.id, optionId)}
          />
        ))}

        <div className="menu-detail__quantity-row">
          <span className="menu-detail__quantity-label" id={QUANTITY_LABEL_ID}>
            수량
          </span>
          <QuantitySelector
            value={quantity}
            onChange={setQuantity}
            labelledBy={QUANTITY_LABEL_ID}
          />
        </div>
      </main>

      <div className="menu-detail__footer">
        <div className="menu-detail__footer-row">
          <Button
            block
            size="xlarge"
            variant="fill"
            disabled={!canAdd}
            label={`담기 · ${formatPrice(total)}`}
            onClick={() =>
              onAddToCart({
                itemId: item.id,
                quantity,
                unitPrice,
                selectedOptionIds,
              })
            }
          />
        </div>
        <div className="menu-detail__safe-area" />
      </div>
    </div>
  )
}
