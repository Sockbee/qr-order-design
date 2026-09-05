import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { OrderLine } from '../components/OrderLine'
import { OrderRound } from '../components/OrderRound'
import { StatusTracker } from '../components/StatusTracker'
import { menuItems } from '../data/menu'
import { formatPrice } from '../utils/price'
import type { PlacedOrder } from '../types/order'

interface OrderStatusPageProps {
  orders: PlacedOrder[]
  latestPublicStatus?: Exclude<PlacedOrder['status'], 'cancelled'> | null
  sessionTotalAmount?: number
  onBack: () => void
  onOrderMore: () => void
  onCallStaff: () => void
}

export function OrderStatusPage({
  orders,
  latestPublicStatus,
  sessionTotalAmount,
  onBack,
  onOrderMore,
  onCallStaff,
}: OrderStatusPageProps) {
  // Newest first, without mutating the session's ordering.
  const rounds = orders.map((order, index) => ({ order, round: index + 1 })).reverse()
  const latestActiveOrder = orders.findLast((order) => order.status !== 'cancelled')
  const fallbackStatus = latestActiveOrder?.status
  const currentStatus = latestPublicStatus ??
    (fallbackStatus === 'cancelled' ? 'accepted' : fallbackStatus) ??
    'accepted'
  const sessionTotal = sessionTotalAmount ?? orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + order.total, 0)

  const appBar = (
    <AppBar
      title="주문 내역"
      onBack={onBack}
      actions={[{ label: '직원 호출', onClick: onCallStaff }]}
    />
  )

  /*
   * S08b. 주문 내역 is now reachable from the menu app bar at any time, so
   * arriving with nothing ordered is a normal state, not a failure.
   */
  if (orders.length === 0) {
    return (
      <div className="flex flex-col min-h-dvh bg-canvas">
        {appBar}
        <main className="flex-1 flex flex-col items-center justify-center gap-1.5 py-0 px-6 text-center">
          <p className="font-display font-normal text-[22px] leading-[30px] text-strong">
            아직 주문 내역이 없어요
          </p>
          <p className="text-sm leading-[21px] font-normal text-body">
            메뉴에서 주문하면 여기에 표시됩니다
          </p>
        </main>
        <div className="sticky bottom-0 z-[2] bg-canvas border-t border-border-default">
          <div className="px-4 pt-3 pb-[var(--layout-safe-area)]">
            <Button
              block
              size="xlarge"
              variant="fill"
              label="메뉴 보기"
              onClick={onOrderMore}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh bg-canvas">
      {appBar}

      <main className="flex flex-1 flex-col gap-5 pt-5 px-4 pb-6">
        <StatusTracker status={currentStatus} />

        <div className="flex flex-col gap-3">
          {rounds.map(({ order, round }) => (
            <OrderRound
              key={order.number}
              round={round}
              placedAt={order.placedAt}
              status={order.status}
              service={order.kind === 'SERVICE'}
              serviceMessage={order.serviceMessage}
              chargedStaffName={order.chargedStaffName}
            >
              {order.lines.map((line, index) => {
                const currentMenuItem = menuItems.find(
                  (candidate) => candidate.id === line.itemId,
                )
                const name = line.nameSnapshot ?? currentMenuItem?.name
                if (!name) return null

                return (
                  <OrderLine
                    key={`${line.itemId}-${index}`}
                    name={name}
                    quantity={line.quantity}
                    amount={line.unitPrice * line.quantity}
                    comped={order.kind === 'SERVICE'}
                  />
                )
              })}
            </OrderRound>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full pt-4 border-t border-dashed border-border-default font-display font-normal text-[22px] leading-8 text-strong">
          <p className="flex-1 min-w-0">현재까지 합계</p>
          <p className="flex-none whitespace-nowrap">
            {formatPrice(sessionTotal)}
          </p>
        </div>
      </main>

      <div className="sticky bottom-0 z-[2] bg-canvas border-t border-border-default">
        <div className="flex flex-col gap-2 px-4 pt-3 pb-[var(--layout-safe-area)]">
          <Button
            block
            size="xlarge"
            variant="fill"
            label="추가 주문"
            onClick={onOrderMore}
          />
          <Button
            block
            size="large"
            variant="weak"
            label="직원 호출"
            onClick={onCallStaff}
          />
        </div>
      </div>
    </div>
  )
}
