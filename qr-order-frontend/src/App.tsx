import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { CartPage } from './pages/CartPage'
import { MenuDetailPage } from './pages/MenuDetailPage'
import { MenuPage } from './pages/MenuPage'
import { OrderCompletePage } from './pages/OrderCompletePage'
import { OrderConfirmationPage } from './pages/OrderConfirmationPage'
import { OrderStatusPage } from './pages/OrderStatusPage'
import { TableConfirmationPage } from './pages/TableConfirmationPage'
import { CallStaffSheet } from './components/CallStaffSheet'
import { useOrderSession } from './hooks/useOrderSession'
import { usePresence } from './hooks/usePresence'
import { useStaffCall } from './hooks/useStaffCall'
import { useOrderPolling } from './hooks/useOrderPolling'
import { useStorefront } from './hooks/useStorefront'
import type { OrderSession } from './hooks/useOrderSession'
import { createOrder, mapCreatedOrder, mapRemoteOrders } from './api/orders'
import {
  categories as mockCategories,
  menuItems as mockMenuItems,
} from './data/menu'
import { tableSession } from './data/session'
import {
  readStored,
  removeStored,
  sessionScopedKey,
  LAST_TABLE_ID_KEY,
  LAST_TOKEN_KEY,
  readStoredString,
  writeStoredString,
  writeStored,
} from './utils/storage'
import type { TableCredentials } from './types/session'
import type { CartLine } from './types/menu'
import { ApiClientError } from './api/client'

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

interface PendingOrder {
  clientRequestId: string
  signature: string
}

function orderCartSignature(cart: CartLine[]): string {
  return JSON.stringify(cart.map((line) => ({
    itemId: line.itemId,
    quantity: line.quantity,
    selectedOptionIds: [...(line.selectedOptionIds ?? [])].sort(),
    unitPrice: line.unitPrice,
  })))
}

interface CatalogRouteProps {
  categories: typeof mockCategories
  menuItems: typeof mockMenuItems
  storefront: ReturnType<typeof useStorefront>
  tableNumber: number
}

function parseCredentials(
  tableId: string | null | undefined,
  tableToken: string | null | undefined,
): TableCredentials | null {
  if (!tableId || !tableToken || !/^T\d{2,}$/.test(tableId) ||
      !/^[0-9a-f]{64}$/i.test(tableToken)) {
    return null
  }
  return { tableId, tableToken }
}

/** `/` resumes the last session this device joined, or the mock one. */
function SessionEntry() {
  const token = readStoredString(LAST_TOKEN_KEY) ?? tableSession.token
  const tableId = readStoredString(LAST_TABLE_ID_KEY) ?? 'T07'
  return <Navigate to={`/t/${tableId}?token=${encodeURIComponent(token)}`} replace />
}

function TableConfirmationRoute({
  onCredentials,
  storefront,
}: {
  onCredentials: (credentials: TableCredentials | null) => void
  storefront: ReturnType<typeof useStorefront>
}) {
  const { tableId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const routeCredentials = parseCredentials(tableId, token)
  const invalidQr = routeCredentials === null

  // Re-scanning the same QR rejoins the existing session (UX-STRUCTURE §5.1).
  useEffect(() => {
    const credentials = parseCredentials(tableId, token)
    onCredentials(credentials)
    if (!credentials) return
    writeStoredString(LAST_TABLE_ID_KEY, credentials.tableId)
    writeStoredString(LAST_TOKEN_KEY, credentials.tableToken)
  }, [onCredentials, tableId, token])

  const fallbackSession = storefront.configured || invalidQr ? null : {
    ...tableSession,
    token: token ?? tableSession.token,
    tableNumber: Number(tableId?.slice(1)) || tableSession.tableNumber,
  }

  return (
    <TableConfirmationPage
      session={storefront.data?.session ?? fallbackSession}
      loading={storefront.loading}
      errorMessage={invalidQr
        ? '유효하지 않은 QR 코드입니다. 테이블의 QR을 다시 스캔해 주세요.'
        : storefront.error?.message}
      retryable={!invalidQr && storefront.retryable}
      onRetry={storefront.retry}
      onStart={() => navigate('/menu')}
    />
  )
}

function MenuRoute({
  session,
  categories,
  menuItems,
  storefront,
  tableNumber,
  onCallStaff,
}: RouteProps & CatalogRouteProps & { onCallStaff: () => void }) {
  const navigate = useNavigate()

  return (
    <MenuPage
      categories={categories}
      menuItems={menuItems}
      cart={session.cart}
      tableNumber={tableNumber}
      loading={storefront.loading}
      errorMessage={storefront.error?.message}
      retryable={storefront.retryable}
      onRetry={storefront.retry}
      onSelectItem={(id) => navigate(`/menu/${id}`)}
      onOpenCart={() => navigate('/cart')}
      onViewOrders={() => navigate('/orders')}
      onCallStaff={onCallStaff}
    />
  )
}

function MenuDetailRoute({
  session,
  categories,
  menuItems,
  storefront,
  tableNumber,
  onCallStaff,
}: RouteProps & CatalogRouteProps & { onCallStaff: () => void }) {
  const { itemId } = useParams()
  const navigate = useNavigate()

  if (storefront.loading || storefront.error) {
    return (
      <MenuPage
        categories={categories}
        menuItems={menuItems}
        cart={session.cart}
        tableNumber={tableNumber}
        loading={storefront.loading}
        errorMessage={storefront.error?.message}
        retryable={storefront.retryable}
        onRetry={storefront.retry}
        onSelectItem={(id) => navigate(`/menu/${id}`)}
        onOpenCart={() => navigate('/cart')}
        onViewOrders={() => navigate('/orders')}
        onCallStaff={onCallStaff}
      />
    )
  }

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
      onCallStaff={onCallStaff}
    />
  )
}

function CartRoute({
  session,
  menuItems,
}: RouteProps & Pick<CatalogRouteProps, 'menuItems'>) {
  const navigate = useNavigate()

  return (
    <CartPage
      menuItems={menuItems}
      cart={session.cart}
      onBack={() => navigate('/menu')}
      onAddMore={() => navigate('/menu')}
      onQuantityChange={session.changeQuantity}
      onRemoveLine={session.removeLine}
      onOrder={() => navigate('/cart/confirm')}
    />
  )
}

function OrderConfirmationRoute({
  session,
  menuItems,
  tableNumber,
  credentials,
  liveMode,
}: RouteProps & Pick<CatalogRouteProps, 'menuItems'> & {
  tableNumber: number
  credentials: TableCredentials | null
  liveMode: boolean
}) {
  const navigate = useNavigate()
  /*
   * Placing an order empties the cart, and react-router runs navigation in a
   * transition — so the empty cart commits before the route change does. This
   * flag keeps the guard below from bouncing us to /cart on the way out.
   */
  const [placing, setPlacing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const pendingKey = credentials
    ? sessionScopedKey(credentials.tableToken, 'pending-order')
    : null

  if (session.cart.length === 0 && !placing) {
    return <Navigate to="/cart" replace />
  }

  return (
    <OrderConfirmationPage
      menuItems={menuItems}
      cart={session.cart}
      tableNumber={tableNumber}
      submitting={placing}
      errorMessage={errorMessage ?? undefined}
      onBack={() => {
        if (!placing) navigate('/cart')
      }}
      onEdit={() => {
        if (!placing) navigate('/cart')
      }}
      onConfirm={() => {
        if (placing) return
        setPlacing(true)
        setErrorMessage(null)

        if (!liveMode) {
          const placed = session.placeOrder()
          navigate(`/orders/${placed.number}/done`, { replace: true })
          return
        }
        if (!credentials) {
          setPlacing(false)
          setErrorMessage('테이블 QR 정보를 다시 확인해 주세요.')
          return
        }

        const signature = orderCartSignature(session.cart)
        const pending = pendingKey
          ? readStored<PendingOrder | null>(pendingKey, null)
          : null
        const clientRequestId = pending?.signature === signature
          ? pending.clientRequestId
          : crypto.randomUUID()
        if (pendingKey) {
          writeStored(pendingKey, { clientRequestId, signature } satisfies PendingOrder)
        }
        void createOrder(credentials, session.cart, clientRequestId)
          .then((response) => {
            if (pendingKey) removeStored(pendingKey)
            const placed = session.placeOrder(
              mapCreatedOrder(response, tableNumber),
            )
            // `replace` so back never returns to a successfully submitted
            // order confirmation (UX-STRUCTURE §5.2).
            navigate(`/orders/${placed.number}/done`, { replace: true })
          })
          .catch((error: unknown) => {
            setPlacing(false)
            if (error instanceof ApiClientError && error.code === 'ORDER_PRICE_CHANGED') {
              const details = error.details as { items?: Array<{ unitPrice?: unknown }> } | undefined
              const unitPrices = details?.items?.map((item) => Number(item.unitPrice)) ?? []
              if (unitPrices.length === session.cart.length && unitPrices.every(Number.isSafeInteger)) {
                session.repriceCart(unitPrices)
                if (pendingKey) removeStored(pendingKey)
              }
            }
            setErrorMessage(
              error instanceof Error
                ? error.message
                : '주문을 접수하지 못했습니다. 다시 시도해 주세요.',
            )
          })
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

function OrderStatusRoute({
  session,
  remote,
  onCallStaff,
}: RouteProps & {
  remote: ReturnType<typeof useOrderPolling>
  onCallStaff: () => void
}) {
  const navigate = useNavigate()
  const tableNumber = Number(remote.data?.table.tableId.slice(1)) ||
    session.orders.at(-1)?.tableNumber ||
    tableSession.tableNumber
  const remoteOrders = remote.data
    ? mapRemoteOrders(remote.data, tableNumber)
    : null
  const orders = remoteOrders ?? session.orders

  /*
   * No redirect when empty any more: 주문 내역 is reachable from the menu app
   * bar before anything is ordered, so OrderStatusPage renders S08b instead.
   */
  return (
    <OrderStatusPage
      groupTableIds={remote.data?.groupTableIds}
      orders={orders}
      sessionTotalAmount={remote.data?.sessionTotalAmount}
      onBack={() => navigate('/menu')}
      onOrderMore={() => navigate('/menu')}
      onCallStaff={onCallStaff}
    />
  )
}

function App() {
  const location = window.location
  const initialTableMatch = location.pathname.match(/^\/t\/(T\d{2,})\/?$/)
  const initialToken = new URLSearchParams(location.search).get('token')
  const storedTableId = readStoredString(LAST_TABLE_ID_KEY)
  const storedToken = readStoredString(LAST_TOKEN_KEY)
  const enteredFromQr = location.pathname.startsWith('/t/')
  const [credentials, setCredentials] = useState<TableCredentials | null>(() => {
    const urlCredentials = parseCredentials(initialTableMatch?.[1], initialToken)
    return enteredFromQr
      ? urlCredentials
      : parseCredentials(storedTableId, storedToken)
  })
  const storefront = useStorefront(credentials)
  const session = useOrderSession(
    credentials?.tableToken ?? tableSession.token,
    Number(credentials?.tableId.slice(1)) || tableSession.tableNumber,
    storefront.configured,
  )
  const remote = useOrderPolling(credentials)
  /*
   * 직원 호출 lives above the router so the "직원을 불렀어요" state survives
   * navigation between the menu, an item and the order history — the same
   * reason the cart does.
   */
  const staffCall = useStaffCall(
    credentials,
    remote.initialLoading ? undefined : remote.data?.activeCall ?? null,
    remote.revision,
  )
  const [callSheetOpen, setCallSheetOpen] = useState(false)
  const callSheet = usePresence(callSheetOpen)
  const categories = storefront.data?.categories ??
    (storefront.configured ? [] : mockCategories)
  const menuItems = storefront.data?.menuItems ??
    (storefront.configured ? [] : mockMenuItems)
  const tableNumber = storefront.data?.session.tableNumber ??
    (Number(credentials?.tableId.slice(1)) || tableSession.tableNumber)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionEntry />} />
        <Route
          path="/t/:tableId"
          element={(
            <TableConfirmationRoute
              onCredentials={setCredentials}
              storefront={storefront}
            />
          )}
        />
        <Route
          path="/menu"
          element={(
            <MenuRoute
              session={session}
              categories={categories}
              menuItems={menuItems}
              storefront={storefront}
              tableNumber={tableNumber}
              onCallStaff={() => setCallSheetOpen(true)}
            />
          )}
        />
        <Route
          path="/menu/:itemId"
          element={(
            <MenuDetailRoute
              session={session}
              categories={categories}
              menuItems={menuItems}
              storefront={storefront}
              tableNumber={tableNumber}
              onCallStaff={() => setCallSheetOpen(true)}
            />
          )}
        />
        <Route
          path="/cart"
          element={<CartRoute session={session} menuItems={menuItems} />}
        />
        <Route
          path="/cart/confirm"
          element={(
            <OrderConfirmationRoute
              session={session}
              menuItems={menuItems}
              tableNumber={tableNumber}
              credentials={credentials}
              liveMode={storefront.configured}
            />
          )}
        />
        <Route
          path="/orders"
          element={(
            <OrderStatusRoute
              session={session}
              remote={remote}
              onCallStaff={() => setCallSheetOpen(true)}
            />
          )}
        />
        <Route
          path="/orders/:orderNumber/done"
          element={<OrderCompleteRoute session={session} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {callSheet.mounted && (
        <CallStaffSheet
          tableNumber={tableNumber}
          phase={staffCall.phase}
          activeCall={staffCall.activeCall}
          error={staffCall.error}
          closing={callSheet.closing}
          onCall={staffCall.call}
          onCancelCall={staffCall.cancel}
          onClose={() => {
            setCallSheetOpen(false)
            staffCall.clearError()
          }}
        />
      )}
    </BrowserRouter>
  )
}

export default App
