import { useState } from 'react'
import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { MenuImage } from '../components/MenuImage'
import { QuantitySelector } from '../components/customer/QuantitySelector'
import { formatPrice } from '../utils/price'
import type { CartLine, MenuItemDetail } from '../types/menu'

interface MenuDetailPageProps {
  item: MenuItemDetail
  onBack: () => void
  onAddToCart: (line: CartLine) => void
  onCallStaff: () => void
}

export function MenuDetailPage({
  item,
  onBack,
  onAddToCart,
  onCallStaff,
}: MenuDetailPageProps) {
  const [quantity, setQuantity] = useState(item.minQuantity ?? 1)
  const unitPrice = item.price
  const total = unitPrice * quantity
  const originLine = [
    item.allergens?.length ? `알레르기 ${item.allergens.join(', ')}` : null,
    item.origin ? `원산지 ${item.origin}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col min-h-dvh bg-canvas">
      <AppBar
        title={item.name}
        onBack={onBack}
        actions={[{ label: '직원 호출', onClick: onCallStaff }]}
      />

      <MenuImage
        src={item.imageUrl}
        loading="eager"
        className="flex-none mx-4 mt-2 h-[216px] rounded-[24px] p-2"
      />

      <main className="flex flex-1 flex-col gap-5 pt-[18px] px-4 pb-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-3">
            <h2 className="flex-1 min-w-0 font-display font-normal text-[30px] leading-[38px] text-strong break-keep">
              {item.name}
            </h2>
            <span className="flex-none whitespace-nowrap text-xl leading-7 font-bold text-strong">
              {formatPrice(item.price)}
            </span>
          </div>
          <p className="text-sm leading-[21px] font-normal text-body">{item.description}</p>
          {/* Allergens are never text-muted (CLAUDE.md §6). */}
          {originLine && (
            <p className="text-[12px] leading-[18px] font-normal text-body">{originLine}</p>
          )}
        </div>

      </main>

      <div className="sticky bottom-0 z-[2] bg-canvas border-t border-border-default">
        <div className="flex items-center gap-3 px-4 pt-3 pb-[var(--layout-safe-area)]">
          <QuantitySelector
            size="large"
            value={quantity}
            onChange={setQuantity}
            min={item.minQuantity ?? 1}
            max={item.maxQuantity ?? 99}
            ariaLabel="수량"
          />
          <div className="flex-1 min-w-0">
            <Button
              block
              size="xlarge"
              variant="fill"
              disabled={item.soldOut}
              label="담기"
              amount={formatPrice(total)}
              onClick={() =>
                onAddToCart({
                  itemId: item.id,
                  nameSnapshot: item.name,
                  quantity,
                  maxQuantitySnapshot: item.maxQuantity ?? 99,
                  unitPrice,
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
