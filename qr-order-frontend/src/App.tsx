import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { CartPage } from './pages/CartPage'
import { MenuDetailPage } from './pages/MenuDetailPage'
import { MenuPage } from './pages/MenuPage'
import { OrderCompletePage } from './pages/OrderCompletePage'
import { OrderConfirmationPage } from './pages/OrderConfirmationPage'
import { OrderStatusPage } from './pages/OrderStatusPage'
import { TableConfirmationPage } from './pages/TableConfirmationPage'
import { useOrderSession } from './hooks/useOrderSession'
import type { OrderSession } from './hooks/useOrderSession'
import { menuItems } from './data/menu'
import { tableSession } from './data/session'
import {
  LAST_TOKEN_KEY,
  readStoredString,
  writeStoredString,
} from './utils/storage'

/**
 * Routes follow UX-STRUCTURE §2.1. Screens not yet built (S00 session resolve,
 * S02b search, error screens E1–E5) have no route yet.
 *
 * Session state lives in `App`, above the router, so it is a single instance
 * that survives every navigation — route elements unmount, and a persistence
 * effect owned by an unmounting component would never flush. Page components
 * stay prop-driven; these route elements are the only place that knows about
 * the router.
 */

interface RouteProps {
  session: OrderSession
}

/** `/` resumes the last session this device joined, or the mock one. */
function SessionEntry() {
  const token = readStoredString(LAST_TOKEN_KEY) ?? tableSession.token
  return <Navigate to={`/t/${token}/start`} replace />
}

function TableConfirmationRoute() {
  const { token } = useParams()
  const navigate = useNavigate()

  // Re-scanning the same QR rejoins the existing session (UX-STRUCTURE §5.1).
  useEffect(() => {
    if (token) writeStoredString(LAST_TOKEN_KEY, token)
  }, [token])

  return (
    <TableConfirmationPage
      session={tableSession}
      onStart={() => navigate('/menu')}
    />
  )
}

function MenuRoute({ session }: RouteProps) {
  const navigate = useNavigate()

  return (
    <MenuPage
      cart={session.cart}
      onSelectItem={(id) => navigate(`/menu/${id}`)}
      onOpenCart={() => navigate('/cart')}
    />
  )
}

function MenuDetailRoute({ session }: RouteProps) {
  const { itemId } = useParams()
  const navigate = useNavigate()

  const item = menuItems.find((candidate) => candidate.id === itemId)
  if (!item) return <Navigate to="/menu" replace />

  return (
    <MenuDetailPage
      item={item}
      onBack={() => navigate('/menu')}
      onAddToCart={(line) => {
        session.addToCart(line)
        navigate('/menu')
      }}
    />
  )
}

function CartRoute({ session }: RouteProps) {
  const navigate = useNavigate()

  return (
    <CartPage
      cart={session.cart}
      onBack={() => navigate('/menu')}
      onAddMore={() => navigate('/menu')}
      onQuantityChange={session.changeQuantity}
      onOrder={() => navigate('/cart/confirm')}
    />
  )
}

function OrderConfirmationRoute({ session }: RouteProps) {
  const navigate = useNavigate()
  /*
   * Placing an order empties the cart, and react-router runs navigation in a
   * transition — so the empty cart commits before the route change does. This
   * flag keeps the guard below from bouncing us to /cart on the way out.
   */
  const [placing, setPlacing] = useState(false)

  if (session.cart.length === 0 && !placing) {
    return <Navigate to="/cart" replace />
  }

  return (
    <OrderConfirmationPage
      cart={session.cart}
      tableNumber={tableSession.tableNumber}
      onBack={() => navigate('/cart')}
      onEdit={() => navigate('/cart')}
      onConfirm={() => {
        setPlacing(true)
        const placed = session.placeOrder()
        // `replace` so back never returns to the confirmation of an order that
        // has already been placed (UX-STRUCTURE §5.2).
        navigate(`/orders/${placed.number}/done`, { replace: true })
      }}
    />
  )
}

function OrderCompleteRoute({ session }: RouteProps) {
  const { orderNumber } = useParams()
  const navigate = useNavigate()

  const order = session.orders.find(
    (candidate) => candidate.number === orderNumber,
  )
  if (!order) return <Navigate to="/orders" replace />

  return (
    <OrderCompletePage
      order={order}
      onViewStatus={() => navigate('/orders')}
      onOrderMore={() => navigate('/menu')}
    />
  )
}

function OrderStatusRoute({ session }: RouteProps) {
  const navigate = useNavigate()

  if (session.orders.length === 0) return <Navigate to="/menu" replace />

  return (
    <OrderStatusPage
      orders={session.orders}
      onOrderMore={() => navigate('/menu')}
      onCallStaff={() => {
        // B1 직원 호출 sheet is not built yet.
      }}
    />
  )
}

function App() {
  const session = useOrderSession(
    tableSession.token,
    tableSession.tableNumber,
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionEntry />} />
        <Route path="/t/:token/start" element={<TableConfirmationRoute />} />
        <Route path="/menu" element={<MenuRoute session={session} />} />
        <Route
          path="/menu/:itemId"
          element={<MenuDetailRoute session={session} />}
        />
        <Route path="/cart" element={<CartRoute session={session} />} />
        <Route
          path="/cart/confirm"
          element={<OrderConfirmationRoute session={session} />}
        />
        <Route path="/orders" element={<OrderStatusRoute session={session} />} />
        <Route
          path="/orders/:orderNumber/done"
          element={<OrderCompleteRoute session={session} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
