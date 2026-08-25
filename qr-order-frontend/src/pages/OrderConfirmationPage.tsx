import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { OrderLine } from '../components/OrderLine'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { TableChip } from '../components/TableChip'
import { menuItems } from '../data/menu'
import { calculateCartTotal } from '../utils/cart'
import type { CartLine } from '../types/menu'
import './OrderConfirmationPage.css'

interface OrderConfirmationPageProps {
  cart: CartLine[]
  tableNumber: number
  onBack: () => void
  onEdit: () => void
  onConfirm: () => void
}

export function OrderConfirmationPage({
  cart,
  tableNumber,
  onBack,
  onEdit,
  onConfirm,
}: OrderConfirmationPageProps) {
  const total = calculateCartTotal(cart)

  return (
    <div className="order-confirmation">
      <AppBar title="주문 확인" onBack={onBack} />

      <main className="order-confirmation__content">
        <TableChip tableNumber={tableNumber} />

        <div className="order-confirmation__summary">
          {cart.map((line, index) => {
            const item = menuItems.find(
              (candidate) => candidate.id === line.itemId,
            )
            if (!item) return null

            return (
              <OrderLine
                key={`${line.itemId}-${index}`}
                name={item.name}
                quantity={line.quantity}
                amount={line.unitPrice * line.quantity}
              />
            )
          })}
        </div>

        <PriceBreakdown total={total} />

        <p className="order-confirmation__payment-note">
          후불 결제 · 식사 후 카운터에서 결제해 주세요
        </p>

        <Button size="medium" variant="weak" label="수정하기" onClick={onEdit} />
      </main>

      <div className="order-confirmation__footer">
        <Button
          block
          size="xlarge"
          variant="fill"
          label="주문 확정"
          disabled={cart.length === 0}
          onClick={onConfirm}
        />
      </div>
      <div className="order-confirmation__safe-area" />
    </div>
  )
}
