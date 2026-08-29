import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { OrderLine } from '../components/OrderLine'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { TableChip } from '../components/TableChip'
import { calculateCartTotal } from '../utils/cart'
import type { CartLine, MenuItemDetail } from '../types/menu'
import './OrderConfirmationPage.css'

interface OrderConfirmationPageProps {
  menuItems: MenuItemDetail[]
  cart: CartLine[]
  tableNumber: number
  onBack: () => void
  onEdit: () => void
  onConfirm: () => void
  submitting?: boolean
  errorMessage?: string
}

export function OrderConfirmationPage({
  menuItems,
  cart,
  tableNumber,
  onBack,
  onEdit,
  onConfirm,
  submitting = false,
  errorMessage,
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
            const name = line.nameSnapshot ?? item?.name
            if (!name) return null

            return (
              <OrderLine
                key={`${line.itemId}-${index}`}
                name={name}
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

        {errorMessage && (
          <p className="order-confirmation__error" role="alert">
            {errorMessage}
          </p>
        )}

        <Button
          size="medium"
          variant="weak"
          label="수정하기"
          disabled={submitting}
          onClick={onEdit}
        />
      </main>

      <div className="order-confirmation__footer">
        <Button
          block
          size="xlarge"
          variant="fill"
          label={submitting ? '주문 접수 중' : '주문 확정'}
          loading={submitting}
          disabled={cart.length === 0}
          onClick={onConfirm}
        />
      </div>
      <div className="order-confirmation__safe-area" />
    </div>
  )
}
