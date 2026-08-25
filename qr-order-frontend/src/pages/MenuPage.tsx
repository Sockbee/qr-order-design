import { useMemo, useState } from 'react'
import { AppBar } from '../components/AppBar'
import { BottomOrderBar } from '../components/BottomOrderBar'
import { CategoryTabs } from '../components/CategoryTabs'
import { MenuItem } from '../components/MenuItem'
import { categories, menuItems } from '../data/menu'
import type { CartLine, MenuItemSummary } from '../types/menu'
import './MenuPage.css'

const CONTENT_PANEL_ID = 'menu-category-panel'

interface MenuPageProps {
  cart: CartLine[]
  onSelectItem: (id: MenuItemSummary['id']) => void
}

export function MenuPage({ cart, onSelectItem }: MenuPageProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    categories[0].id,
  )

  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ??
    categories[0]

  const visibleItems = useMemo(
    () => menuItems.filter((item) => item.categoryId === selectedCategoryId),
    [selectedCategoryId],
  )

  const cartCount = cart.length
  const cartTotal = cart.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  )

  return (
    <div className="menu-page">
      <AppBar title="메뉴" cartCount={cartCount} />

      <CategoryTabs
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={setSelectedCategoryId}
        panelId={CONTENT_PANEL_ID}
      />

      <main
        className="menu-page__content"
        id={CONTENT_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`category-tab-${selectedCategory.id}`}
      >
        <h2 className="menu-page__section-title">{selectedCategory.heading}</h2>

        {visibleItems.length > 0 ? (
          <div className="menu-page__list">
            {visibleItems.map((item) => (
              <MenuItem key={item.id} item={item} onSelect={onSelectItem} />
            ))}
          </div>
        ) : (
          <p className="menu-page__empty">준비 중인 메뉴입니다.</p>
        )}
      </main>

      <BottomOrderBar total={cartTotal} itemCount={cartCount} />
    </div>
  )
}
