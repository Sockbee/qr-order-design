import { AppBar } from '../components/AppBar'
import { BottomOrderBar } from '../components/BottomOrderBar'
import { Button } from '../components/Button'
import { CartLine } from '../components/CartLine'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { menuItems } from '../data/menu'
import { calculateCartTotals, describeCartLineOptions } from '../utils/cart'
import type { CartLine as CartLineModel } from '../types/menu'
import './CartPage.css'

interface CartPageProps {
  cart: CartLineModel[]
  onBack: () => void
  onAddMore: () => void
  onQuantityChange: (index: number, next: number) => void
  onOrder: () => void
}

export function CartPage({
  cart,
  onBack,
  onAddMore,
  onQuantityChange,
  onOrder,
}: CartPageProps) {
  const totals = calculateCartTotals(cart)

  return (
    <div className="cart-page">
      <AppBar title="장바구니" onBack={onBack} />

      <main className="cart-page__content">
        {cart.length > 0 ? (
          cart.map((line, index) => {
            const item = menuItems.find(
              (candidate) => candidate.id === line.itemId,
            )
            if (!item) return null

            return (
              <CartLine
                key={`${line.itemId}-${index}`}
                name={item.name}
                options={describeCartLineOptions(item, line)}
                lineTotal={line.unitPrice * line.quantity}
                quantity={line.quantity}
                imageUrl={item.imageUrl}
                onQuantityChange={(next) => onQuantityChange(index, next)}
              />
            )
          })
        ) : (
          <p className="cart-page__empty">장바구니가 비어 있어요.</p>
        )}

        <Button
          block
          size="large"
          variant="weak"
          label="메뉴 더 담기"
          onClick={onAddMore}
        />

        <PriceBreakdown totals={totals} />
      </main>

      <BottomOrderBar
        total={totals.total}
        itemCount={cart.length}
        onOrder={onOrder}
      />
    </div>
  )
}
