import { useState } from 'react'
import { CartPage } from './pages/CartPage'
import { MenuDetailPage } from './pages/MenuDetailPage'
import { MenuPage } from './pages/MenuPage'
import { TableConfirmationPage } from './pages/TableConfirmationPage'
import { initialCart, menuItems } from './data/menu'
import { tableSession } from './data/session'
import type { CartLine, MenuItemSummary } from './types/menu'

type Screen = 'start' | 'menu' | 'cart'

/**
 * Minimal view switching so S01, S02, S04 and S05 are reachable from one
 * another. This is a placeholder for real routing (`/t/{token}/start`,
 * `/menu`, `/menu/{itemId}`, `/cart` per UX-STRUCTURE §2.1), which lands when
 * a router is introduced.
 */
function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [cart, setCart] = useState<CartLine[]>(initialCart)
  const [openItemId, setOpenItemId] = useState<MenuItemSummary['id'] | null>(
    null,
  )

  const openItem = menuItems.find((item) => item.id === openItemId)

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

  if (screen === 'cart') {
    return (
      <CartPage
        cart={cart}
        onBack={() => setScreen('menu')}
        onAddMore={() => setScreen('menu')}
        onQuantityChange={handleQuantityChange}
        onOrder={() => {
          // S06 Order Confirmation is not built yet.
        }}
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
