import { useMemo, useState } from 'react'
import { AppBar } from '../components/AppBar'
import { BottomOrderBar } from '../components/BottomOrderBar'
import { CategoryTabs } from '../components/customer/CategoryTabs'
import { MenuItem } from '../components/MenuItem'
import { Button } from '../components/Button'
import { calculateCartTotal } from '../utils/cart'
import type {
  CartLine,
  MenuCategory,
  MenuItemDetail,
  MenuItemSummary,
} from '../types/menu'

const CONTENT_PANEL_ID = 'menu-category-panel'

interface MenuPageProps {
  categories: MenuCategory[]
  menuItems: MenuItemDetail[]
  cart: CartLine[]
  /** Shown as the app-bar chip. */
  tableNumber?: number
  loading?: boolean
  errorMessage?: string
  retryable?: boolean
  onRetry?: () => void
  onSelectItem: (id: MenuItemSummary['id']) => void
  onOpenCart: () => void
  onViewOrders: () => void
  onCallStaff: () => void
}

export function MenuPage({
  categories,
  menuItems,
  cart,
  tableNumber,
  loading = false,
  errorMessage,
  retryable = false,
  onRetry,
  onSelectItem,
  onOpenCart,
  onViewOrders,
  onCallStaff,
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
    <div className="flex flex-col min-h-dvh bg-canvas">
      {/*
        * The cart chip used to live here and duplicated the sticky bar's count
        * and total. That slot now carries the two actions that had no entry
        * point at all; the cart stays in BottomOrderBar.
        */}
      <AppBar
        title="메뉴"
        chip={tableNumber !== undefined ? `테이블 ${tableNumber}` : undefined}
        actions={[
          { label: '주문 내역', onClick: onViewOrders },
          { label: '직원 호출', onClick: onCallStaff },
        ]}
      />

      {categories.length > 0 && (
        <CategoryTabs
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={setRequestedCategoryId}
          panelId={CONTENT_PANEL_ID}
        />
      )}

      <main
        className="flex-1 pt-4 px-4 pb-0"
        id={CONTENT_PANEL_ID}
        role="tabpanel"
        aria-labelledby={selectedCategory
          ? `category-tab-${selectedCategory.id}`
          : undefined}
      >
        {loading ? (
          <div className="flex flex-col" aria-busy="true">
            <div className="h-[34px] w-32 mb-1 rounded-[6px] bg-surface animate-pulse motion-reduce:animate-none" />
            {[0, 1, 2].map((row) => (
              <div
                className="flex items-center gap-4 py-4 border-b border-dashed border-border-default"
                key={row}
              >
                <div className="flex-none size-[84px] rounded-btn-xl bg-surface animate-pulse motion-reduce:animate-none" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-5 w-2/5 rounded-[4px] bg-surface animate-pulse motion-reduce:animate-none" />
                  <div className="h-4 w-4/5 rounded-[4px] bg-surface animate-pulse motion-reduce:animate-none" />
                  <div className="h-5 w-1/4 rounded-[4px] bg-surface animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-start gap-4 py-8 px-0 text-sm leading-[21px] font-normal text-body">
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
          // Keyed so a category change remounts the panel and replays panel-in.
          <div key={selectedCategory.id} className="animate-panel-in motion-reduce:animate-none">
            <h2 className="font-display font-normal text-[26px] leading-[34px] text-strong mb-1">
              {selectedCategory.heading}
            </h2>
            {visibleItems.length > 0 ? (
              <div className="flex flex-col">
                {visibleItems.map((item) => (
                  <MenuItem key={item.id} item={item} onSelect={onSelectItem} />
                ))}
              </div>
            ) : (
              <p className="py-8 px-0 text-sm leading-[21px] font-normal text-body text-center">
                준비 중인 메뉴입니다.
              </p>
            )}
          </div>
        ) : (
          <p className="py-8 px-0 text-sm leading-[21px] font-normal text-body text-center">
            등록된 메뉴가 없습니다.
          </p>
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
