import { useState } from 'react'
import { AppBar } from '../components/AppBar'
import { BottomOrderBar } from '../components/BottomOrderBar'
import { Button } from '../components/Button'
import { CartLine } from '../components/CartLine'
import { Dialog } from '../components/Dialog'
import { PriceBreakdown } from '../components/PriceBreakdown'
import { usePresence } from '../hooks/usePresence'
import { calculateCartTotal, describeCartLineOptions } from '../utils/cart'
import { objectParticle } from '../utils/korean'
import type { CartLine as CartLineModel, MenuItemDetail } from '../types/menu'

interface CartPageProps {
  menuItems: MenuItemDetail[]
  cart: CartLineModel[]
  onBack: () => void
  onAddMore: () => void
  onQuantityChange: (index: number, next: number) => void
  onRemoveLine: (index: number) => void
  onOrder: () => void
}

interface RemoveTarget {
  index: number
  name: string
}

export function CartPage({
  menuItems,
  cart,
  onBack,
  onAddMore,
  onQuantityChange,
  onRemoveLine,
  onOrder,
}: CartPageProps) {
  const total = calculateCartTotal(cart)
  // Kept separately from `removeOpen` so the title survives the exit animation.
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const removeDialog = usePresence(removeOpen)

  const handleQuantityChange = (index: number, next: number) => {
    // Reducing below 1 removes the line, but only after confirmation
    // (UX-STRUCTURE §4.2 D1 "Remove-item confirm") — the quantity itself
    // never drops to 0 without it.
    if (next < 1) {
      const line = cart[index]
      setRemoveTarget({
        index,
        name:
          line?.nameSnapshot ??
          menuItems.find((item) => item.id === line?.itemId)?.name ??
          '항목',
      })
      setRemoveOpen(true)
      return
    }
    onQuantityChange(index, next)
  }

  return (
    <div className="flex flex-col min-h-dvh bg-canvas">
      <AppBar title="장바구니" onBack={onBack} />

      <main className="flex flex-1 flex-col gap-4 pt-2 px-4 pb-6">
        {cart.length > 0 ? (
          <div className="flex flex-col divide-y divide-dashed divide-border-default [&>*]:py-4">
            {cart.map((line, index) => {
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
                  onQuantityChange={(next) => handleQuantityChange(index, next)}
                />
              )
            })}
          </div>
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

      {removeDialog.mounted && removeTarget && (
        <Dialog
          title={`${removeTarget.name}${objectParticle(removeTarget.name)} 삭제하시겠습니까?`}
          confirmLabel="삭제"
          cancelLabel="취소"
          closing={removeDialog.closing}
          onConfirm={() => {
            onRemoveLine(removeTarget.index)
            setRemoveOpen(false)
          }}
          onCancel={() => setRemoveOpen(false)}
        />
      )}
    </div>
  )
}
