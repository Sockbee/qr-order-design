import { useRef } from 'react'
import type { MenuCategory } from '../types/menu'
import './CategoryTabs.css'

interface CategoryTabsProps {
  categories: MenuCategory[]
  selectedId: MenuCategory['id']
  onSelect: (id: MenuCategory['id']) => void
  /** id of the panel the tabs control, for `aria-controls`. */
  panelId: string
}

export function CategoryTabs({
  categories,
  selectedId,
  onSelect,
  panelId,
}: CategoryTabsProps) {
  const listRef = useRef<HTMLDivElement>(null)

  const focusTabAt = (index: number) => {
    const wrapped = (index + categories.length) % categories.length
    onSelect(categories[wrapped].id)
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    )
    tabs?.[wrapped]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTabAt(index + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTabAt(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTabAt(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTabAt(categories.length - 1)
    }
  }

  return (
    <div
      className="category-tabs"
      role="tablist"
      aria-label="메뉴 카테고리"
      ref={listRef}
    >
      {categories.map((category, index) => {
        const selected = category.id === selectedId
        return (
          <button
            key={category.id}
            type="button"
            role="tab"
            id={`category-tab-${category.id}`}
            className="category-tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(category.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="category-tab__label">{category.label}</span>
            <span className="category-tab__indicator" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
