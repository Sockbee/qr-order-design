import { usePersistentState } from './usePersistentState'
import { initialCart } from '../data/menu'
import { calculateCartTotal, isSameCartLine } from '../utils/cart'
import { sessionScopedKey } from '../utils/storage'
import type { CartLine } from '../types/menu'
import type { PlacedOrder } from '../types/order'

/** Diner-facing order numbers start here in the UI phase. */
const FIRST_ORDER_NUMBER = 1042

/**
 * Cart and order history for one table session, persisted under the session
 * token. Re-entering with the same token rejoins the session rather than
 * starting a new one (UX-STRUCTURE §5.1) — otherwise a diner who reloads
 * loses their order history.
 */
export interface OrderSession {
  cart: CartLine[]
  orders: PlacedOrder[]
  addToCart: (line: CartLine) => void
  changeQuantity: (index: number, next: number) => void
  removeLine: (index: number) => void
  /**
   * Commits a server-created order, or creates the mock order when the API is
   * intentionally not configured.
   */
  placeOrder: (remoteOrder?: PlacedOrder) => PlacedOrder
}

export function useOrderSession(
  token: string,
  tableNumber: number,
  liveMode = false,
): OrderSession {
  const [cart, setCart] = usePersistentState<CartLine[]>(
    sessionScopedKey(token, liveMode ? 'live-cart' : 'cart'),
    liveMode ? [] : initialCart,
  )
  const [orders, setOrders] = usePersistentState<PlacedOrder[]>(
    sessionScopedKey(token, liveMode ? 'live-orders' : 'orders'),
    [],
  )

  const addToCart = (line: CartLine) => {
    setCart((current) => {
      const matchIndex = current.findIndex((existing) => isSameCartLine(existing, line))
      if (matchIndex === -1) return [...current, line]
      return current.map((existing, index) =>
        index === matchIndex
          ? { ...existing, quantity: existing.quantity + line.quantity }
          : existing,
      )
    })
  }

  const changeQuantity = (index: number, next: number) => {
    setCart((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, quantity: next } : line,
      ),
    )
  }

  const removeLine = (index: number) => {
    setCart((current) => current.filter((_, lineIndex) => lineIndex !== index))
  }

  const placeOrder = (remoteOrder?: PlacedOrder): PlacedOrder => {
    const placed: PlacedOrder = remoteOrder ?? {
      number: `A-${FIRST_ORDER_NUMBER + orders.length}`,
      tableNumber,
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
    return placed
  }

  return { cart, orders, addToCart, changeQuantity, removeLine, placeOrder }
}
