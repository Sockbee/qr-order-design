import { useRef } from 'react'
import type { MenuCategory } from '../../types/menu'

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
      className="sticky top-[calc(var(--layout-app-bar-height)+var(--layout-safe-area-top))] z-[2] flex overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-canvas"
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
            className="group flex-none flex flex-col items-center gap-1.5 h-12 pt-3.5 px-4 pb-0 border-0 bg-canvas cursor-pointer focus-visible:[outline-offset:-2px]"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(category.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="text-base leading-6 font-normal text-muted whitespace-nowrap group-aria-selected:font-bold group-aria-selected:text-strong">
              {category.label}
            </span>
            <span
              className="w-full h-0.5 bg-transparent group-aria-selected:bg-primary"
              aria-hidden="true"
            />
          </button>
        )
      })}
    </div>
  )
}
