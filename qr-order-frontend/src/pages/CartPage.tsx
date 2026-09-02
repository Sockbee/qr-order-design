import { AppBar } from '../components/AppBar'
import { BottomOrderBar } from '../components/BottomOrderBar'
import { Button } from '../components/Button'
import { CartLine } from '../components/CartLine'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { calculateCartTotal, describeCartLineOptions } from '../utils/cart'
import type { CartLine as CartLineModel, MenuItemDetail } from '../types/menu'

interface CartPageProps {
  menuItems: MenuItemDetail[]
  cart: CartLineModel[]
  onBack: () => void
  onAddMore: () => void
  onQuantityChange: (index: number, next: number) => void
  onOrder: () => void
}

export function CartPage({
  menuItems,
  cart,
  onBack,
  onAddMore,
  onQuantityChange,
  onOrder,
}: CartPageProps) {
  const total = calculateCartTotal(cart)

  return (
    <div className="flex flex-col min-h-dvh bg-canvas">
      <AppBar title="장바구니" onBack={onBack} />

      <main className="flex flex-1 flex-col gap-4 pt-4 px-4 pb-0">
        {cart.length > 0 ? (
          cart.map((line, index) => {
            const item = menuItems.find(
              (candidate) => candidate.id === line.itemId,
            )
            const name = line.nameSnapshot ?? item?.name
            if (!name) return null
            const options = line.selectedOptionNames?.join(' · ') ??
              (item ? describeCartLineOptions(item, line) : '')

            return (
              <CartLine
                key={`${line.itemId}-${index}`}
                name={name}
                options={options}
                lineTotal={line.unitPrice * line.quantity}
                quantity={line.quantity}
                imageUrl={item?.imageUrl}
                onQuantityChange={(next) => onQuantityChange(index, next)}
              />
            )
          })
        ) : (
          <p className="py-8 px-0 text-sm leading-[21px] font-normal text-body text-center">
            장바구니가 비어 있어요.
          </p>
        )}

        <Button
          block
          size="large"
          variant="weak"
          label="메뉴 더 담기"
          onClick={onAddMore}
        />

        <PriceBreakdown total={total} />
      </main>

      <BottomOrderBar
        total={total}
        itemCount={cart.length}
        onOrder={onOrder}
      />
    </div>
  )
}
