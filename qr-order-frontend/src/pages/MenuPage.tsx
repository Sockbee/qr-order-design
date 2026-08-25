import { useMemo, useState } from 'react'
import { AppBar } from '../components/AppBar'
import { BottomOrderBar } from '../components/BottomOrderBar'
import { CategoryTabs } from '../components/CategoryTabs'
import { MenuItem } from '../components/MenuItem'
import { Button } from '../components/Button'
import { calculateCartTotal } from '../utils/cart'
import type {
  CartLine,
  MenuCategory,
  MenuItemDetail,
  MenuItemSummary,
} from '../types/menu'
import './MenuPage.css'

const CONTENT_PANEL_ID = 'menu-category-panel'

interface MenuPageProps {
  categories: MenuCategory[]
  menuItems: MenuItemDetail[]
  cart: CartLine[]
  loading?: boolean
  errorMessage?: string
  retryable?: boolean
  onRetry?: () => void
  onSelectItem: (id: MenuItemSummary['id']) => void
  onOpenCart: () => void
}

export function MenuPage({
  categories,
  menuItems,
  cart,
  loading = false,
  errorMessage,
  retryable = false,
  onRetry,
  onSelectItem,
  onOpenCart,
}: MenuPageProps) {
  const [requestedCategoryId, setRequestedCategoryId] = useState<string | null>(null)

  const selectedCategory =
    categories.find((category) => category.id === requestedCategoryId) ??
    categories[0]
  const selectedCategoryId = selectedCategory?.id ?? ''

  const visibleItems = useMemo(
    () => menuItems.filter((item) => item.categoryId === selectedCategoryId),
    [menuItems, selectedCategoryId],
  )

  const cartCount = cart.length
  // The sticky bar shows what the diner owes — the same figure the cart's
  // 총 결제금액 row carries.
  const cartTotal = calculateCartTotal(cart)

  return (
    <div className="menu-page">
      <AppBar title="메뉴" cartCount={cartCount} onCartClick={onOpenCart} />

      {categories.length > 0 && (
        <CategoryTabs
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={setRequestedCategoryId}
          panelId={CONTENT_PANEL_ID}
        />
      )}

      <main
        className="menu-page__content"
        id={CONTENT_PANEL_ID}
        role="tabpanel"
        aria-labelledby={selectedCategory
          ? `category-tab-${selectedCategory.id}`
          : undefined}
      >
        {loading ? (
          <div className="menu-page__skeleton-list" aria-busy="true">
            {[0, 1, 2].map((row) => (
              <div className="menu-page__skeleton-row" key={row} />
            ))}
          </div>
        ) : errorMessage ? (
          <div className="menu-page__error">
            <p>{errorMessage}</p>
            {retryable && onRetry && (
              <Button
                size="large"
                variant="weak"
                label="다시 시도"
                onClick={onRetry}
              />
            )}
          </div>
        ) : selectedCategory ? (
          <>
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
          </>
        ) : (
          <p className="menu-page__empty">등록된 메뉴가 없습니다.</p>
        )}
      </main>

      <BottomOrderBar
        total={cartTotal}
        itemCount={cartCount}
        onOrder={onOpenCart}
      />
    </div>
  )
}
