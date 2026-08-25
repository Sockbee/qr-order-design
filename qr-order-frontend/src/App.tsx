import { useState } from 'react'
import { CartPage } from './pages/CartPage'
import { MenuDetailPage } from './pages/MenuDetailPage'
import { MenuPage } from './pages/MenuPage'
import { OrderCompletePage } from './pages/OrderCompletePage'
import { OrderConfirmationPage } from './pages/OrderConfirmationPage'
import { TableConfirmationPage } from './pages/TableConfirmationPage'
import { initialCart, menuItems } from './data/menu'
import { tableSession } from './data/session'
import { calculateCartTotal } from './utils/cart'
import type { CartLine, MenuItemSummary } from './types/menu'
import type { PlacedOrder } from './types/order'

type Screen = 'start' | 'menu' | 'cart' | 'confirm' | 'complete'

/** Diner-facing order numbers start here in the UI phase. */
const FIRST_ORDER_NUMBER = 1042

/**
 * Minimal view switching so S01, S02, S04, S05, S06 and S07 are reachable from
 * one another. This is a placeholder for real routing (`/t/{token}/start`,
 * `/menu`, `/menu/{itemId}`, `/cart`, `/cart/confirm`, `/orders/{id}/done` per
 * UX-STRUCTURE §2.1), which lands when a router is introduced.
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
        onViewStatus={() => {
          // S08 Order Status is not built yet.
        }}
        onOrderMore={() => setScreen('menu')}
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
