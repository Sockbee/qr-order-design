import { useState } from 'react'
import { MenuDetailPage } from './pages/MenuDetailPage'
import { MenuPage } from './pages/MenuPage'
import { TableConfirmationPage } from './pages/TableConfirmationPage'
import { initialCart, menuItems } from './data/menu'
import { tableSession } from './data/session'
import type { CartLine, MenuItemSummary } from './types/menu'

type Screen = 'start' | 'menu'

/**
 * Minimal view switching so S01, S02 and S04 are reachable from one another.
 * This is a placeholder for real routing (`/t/{token}/start`, `/menu`,
 * `/menu/{itemId}` per UX-STRUCTURE §2.1), which lands when a router is
 * introduced.
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

  return <MenuPage cart={cart} onSelectItem={setOpenItemId} />
}

export default App
