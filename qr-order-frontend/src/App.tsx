import { useState } from 'react'
import { MenuDetailPage } from './pages/MenuDetailPage'
import { MenuPage } from './pages/MenuPage'
import { initialCart, menuItems } from './data/menu'
import type { CartLine, MenuItemSummary } from './types/menu'

/**
 * Minimal view switching so S02 and S04 are reachable from one another.
 * This is a placeholder for real routing (`/menu`, `/menu/{itemId}` per
 * UX-STRUCTURE §2.1), which lands when a router is introduced.
 */
function App() {
  const [cart, setCart] = useState<CartLine[]>(initialCart)
  const [openItemId, setOpenItemId] = useState<MenuItemSummary['id'] | null>(
    null,
  )

  const openItem = menuItems.find((item) => item.id === openItemId)

  const handleAddToCart = (line: CartLine) => {
    setCart((current) => [...current, line])
    setOpenItemId(null)
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
