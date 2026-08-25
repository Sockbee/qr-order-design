import { useState } from 'react'
import { CartPage } from './pages/CartPage'
import { MenuDetailPage } from './pages/MenuDetailPage'
import { MenuPage } from './pages/MenuPage'
import { OrderCompletePage } from './pages/OrderCompletePage'
import { OrderConfirmationPage } from './pages/OrderConfirmationPage'
import { OrderStatusPage } from './pages/OrderStatusPage'
import { TableConfirmationPage } from './pages/TableConfirmationPage'
import { initialCart, menuItems } from './data/menu'
import { tableSession } from './data/session'
import { calculateCartTotal } from './utils/cart'
import type { CartLine, MenuItemSummary } from './types/menu'
import type { PlacedOrder } from './types/order'

type Screen = 'start' | 'menu' | 'cart' | 'confirm' | 'complete' | 'status'

/** Diner-facing order numbers start here in the UI phase. */
const FIRST_ORDER_NUMBER = 1042

/**
 * Minimal view switching so S01, S02, S04, S05, S06, S07 and S08 are reachable
 * from one another. This is a placeholder for real routing (`/t/{token}/start`,
 * `/menu`, `/menu/{itemId}`, `/cart`, `/cart/confirm`, `/orders/{id}/done`,
 * `/orders` per UX-STRUCTURE §2.1), which lands when a router is introduced.
 */
function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [cart, setCart] = useState<CartLine[]>(initialCart)
  const [orders, setOrders] = useState<PlacedOrder[]>([])
  const [openItemId, setOpenItemId] = useState<MenuItemSummary['id'] | null>(
    null,
  )

  const openItem = menuItems.find((item) => item.id === openItemId)
  const latestOrder = orders.at(-1)

  const handleAddToCart = (line: CartLine) => {
    setCart((current) => [...current, line])
    setOpenItemId(null)
  }

  const handleQuantityChange = (index: number, next: number) => {
    setCart((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, quantity: next } : line,
      ),
    )
  }

  const handleConfirmOrder = () => {
    const placed: PlacedOrder = {
      number: `A-${FIRST_ORDER_NUMBER + orders.length}`,
      tableNumber: tableSession.tableNumber,
      lines: cart,
      total: calculateCartTotal(cart),
      placedAt: new Date().toISOString(),
      // Mock only. The real status arrives from the server poll
      // (UX-STRUCTURE §5.4); the S08 frame draws this step as the current one.
      status: 'preparing',
    }
    setOrders((current) => [...current, placed])
    // The cart is a new round once an order is placed (UX-STRUCTURE A3).
    setCart([])
    setScreen('complete')
  }

  if (screen === 'start') {
    return (
      <TableConfirmationPage
        session={tableSession}
        onStart={() => setScreen('menu')}
      />
    )
  }

  if (openItem) {
    return (
      <MenuDetailPage
        item={openItem}
        onBack={() => setOpenItemId(null)}
        onAddToCart={handleAddToCart}
      />
    )
  }

  if (screen === 'complete' && latestOrder) {
    return (
      <OrderCompletePage
        order={latestOrder}
        onViewStatus={() => setScreen('status')}
        onOrderMore={() => setScreen('menu')}
      />
    )
  }

  if (screen === 'status' && orders.length > 0) {
    return (
      <OrderStatusPage
        orders={orders}
        onOrderMore={() => setScreen('menu')}
        onCallStaff={() => {
          // B1 직원 호출 sheet is not built yet.
        }}
      />
    )
  }

  if (screen === 'confirm') {
    return (
      <OrderConfirmationPage
        cart={cart}
        tableNumber={tableSession.tableNumber}
        onBack={() => setScreen('cart')}
        onEdit={() => setScreen('cart')}
        onConfirm={handleConfirmOrder}
      />
    )
  }

  if (screen === 'cart') {
    return (
      <CartPage
        cart={cart}
        onBack={() => setScreen('menu')}
        onAddMore={() => setScreen('menu')}
        onQuantityChange={handleQuantityChange}
        onOrder={() => setScreen('confirm')}
      />
    )
  }

  return (
    <MenuPage
      cart={cart}
      onSelectItem={setOpenItemId}
      onOpenCart={() => setScreen('cart')}
    />
  )
}

export default App
