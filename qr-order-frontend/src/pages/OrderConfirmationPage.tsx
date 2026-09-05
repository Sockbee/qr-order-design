import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { OrderLine } from '../components/OrderLine'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { TableChip } from '../components/TableChip'
import { calculateCartTotal } from '../utils/cart'
import { formatPrice } from '../utils/price'
import type { CartLine, MenuItemDetail } from '../types/menu'

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
    <div className="flex flex-col min-h-dvh bg-canvas">
      <AppBar title="주문 확인" onBack={onBack} />

      <main className="flex flex-1 flex-col items-start gap-5 pt-4 px-4 pb-6">
        <TableChip tableNumber={tableNumber} />

        <div className="flex flex-col gap-2 w-full p-4 rounded-btn-xl bg-surface">
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

        <p className="w-full text-sm leading-[21px] font-normal text-body">
          후불 결제 · 식사 후 카운터에서 결제해 주세요
        </p>

        {errorMessage && (
          <p
            className="w-full m-0 py-2 px-3 rounded-row bg-[var(--color-status-attention-bg)] text-sm leading-[21px] font-bold text-[var(--color-status-attention-fg)]"
            role="alert"
          >
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

      <div className="sticky bottom-0 z-[2] bg-canvas border-t border-border-default">
        <div className="px-4 pt-3 pb-[var(--layout-safe-area)]">
          <Button
            block
            size="xlarge"
            variant="fill"
            label={submitting ? '주문 접수 중' : '주문 확정'}
            amount={cart.length > 0 ? formatPrice(total) : undefined}
            loading={submitting}
            disabled={cart.length === 0}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  )
}
