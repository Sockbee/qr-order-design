import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { OrderLine } from '../components/OrderLine'
import { OrderRound } from '../components/OrderRound'
import { StatusTracker } from '../components/StatusTracker'
import { menuItems } from '../data/menu'
import { formatPrice } from '../utils/price'
import type { PlacedOrder } from '../types/order'
import './OrderStatusPage.css'

interface OrderStatusPageProps {
  orders: PlacedOrder[]
  onOrderMore: () => void
  onCallStaff: () => void
}

export function OrderStatusPage({
  orders,
  onOrderMore,
  onCallStaff,
}: OrderStatusPageProps) {
  // Newest first, without mutating the session's ordering.
  const rounds = orders.map((order, index) => ({ order, round: index + 1 })).reverse()
  const currentStatus = orders.at(-1)?.status ?? 'accepted'
  const sessionTotal = orders.reduce((sum, order) => sum + order.total, 0)

  return (
    <div className="order-status">
      <AppBar title="주문 현황" />

      <main className="order-status__content">
        <StatusTracker status={currentStatus} />

        {rounds.map(({ order, round }) => (
          <OrderRound
            key={order.number}
            round={round}
            placedAt={order.placedAt}
          >
            {order.lines.map((line, index) => {
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
          </OrderRound>
        ))}

        <div className="order-status__session-total">
          <p className="order-status__session-label">현재까지 합계</p>
          <p className="order-status__session-value">
            {formatPrice(sessionTotal)}
          </p>
        </div>
      </main>

      <div className="order-status__footer">
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
      <div className="order-status__safe-area" />
    </div>
  )
}
