import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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
import { StaffTableHomePage } from './pages/staff/StaffTableHomePage'
import { StaffLoginPage } from './pages/staff/StaffLoginPage'
import { TableDetailPanel } from './components/staff/TableDetailPanel'
import {
  StaffAddOrderRoute,
  StaffTableOperationRoute,
} from './pages/staff/StaffOperationRoutes'
import type { StaffOperation } from './pages/staff/StaffOperationRoutes'
import { CallStaffSheet } from './components/CallStaffSheet'
import { useOrderSession } from './hooks/useOrderSession'
import { useStaffCall } from './hooks/useStaffCall'
import { useOrderPolling } from './hooks/useOrderPolling'
import { useStorefront } from './hooks/useStorefront'
import { useStaffTableHome } from './hooks/useStaffTableHome'
import { useStaffAuth } from './hooks/useStaffAuth'
import { useStaffTableDetail } from './hooks/useStaffTableDetail'
import type { OrderSession } from './hooks/useOrderSession'
import { mapRemoteOrders } from './api/orders'
import {
  categories as mockCategories,
  menuItems as mockMenuItems,
} from './data/menu'
import { tableSession } from './data/session'
import {
  LAST_TABLE_ID_KEY,
  LAST_TOKEN_KEY,
  readStoredString,
  writeStoredString,
} from './utils/storage'
import type { TableCredentials } from './types/session'

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

interface CatalogRouteProps {
  categories: typeof mockCategories
  menuItems: typeof mockMenuItems
  storefront: ReturnType<typeof useStorefront>
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
  onCredentials: (credentials: TableCredentials) => void
  storefront: ReturnType<typeof useStorefront>
}) {
  const { tableId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  // Re-scanning the same QR rejoins the existing session (UX-STRUCTURE §5.1).
  useEffect(() => {
    const credentials = parseCredentials(tableId, token)
    if (!credentials) return
    writeStoredString(LAST_TABLE_ID_KEY, credentials.tableId)
    writeStoredString(LAST_TOKEN_KEY, credentials.tableToken)
    onCredentials(credentials)
  }, [onCredentials, tableId, token])

  const fallbackSession = storefront.configured ? null : {
    ...tableSession,
    token: token ?? tableSession.token,
    tableNumber: Number(tableId?.slice(1)) || tableSession.tableNumber,
  }

  return (
    <TableConfirmationPage
      session={storefront.data?.session ?? fallbackSession}
      loading={storefront.loading}
      errorMessage={storefront.error?.message}
      retryable={storefront.retryable}
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
  onCallStaff,
}: RouteProps & CatalogRouteProps & { onCallStaff: () => void }) {
  const navigate = useNavigate()

  return (
    <MenuPage
      categories={categories}
      menuItems={menuItems}
      cart={session.cart}
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
      onOrder={() => navigate('/cart/confirm')}
    />
  )
}

function OrderConfirmationRoute({
  session,
  menuItems,
  tableNumber,
}: RouteProps & Pick<CatalogRouteProps, 'menuItems'> & { tableNumber: number }) {
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
      menuItems={menuItems}
      cart={session.cart}
      tableNumber={tableNumber}
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
      orders={orders}
      latestPublicStatus={remote.data?.latestPublicStatus}
      sessionTotalAmount={remote.data?.sessionTotalAmount}
      onBack={() => navigate('/menu')}
      onOrderMore={() => navigate('/menu')}
      onCallStaff={onCallStaff}
    />
  )
}

type StaffAuth = ReturnType<typeof useStaffAuth>

/**
 * Every staff screen sits behind A09. When the API is not configured the
 * guard stands down, so the seeded UI still runs without a deployment.
 */
function RequireStaffAuth({
  auth,
  children,
}: {
  auth: StaffAuth
  children: ReactNode
}) {
  if (auth.configured && !auth.session) {
    return <Navigate to="/staff/login" replace />
  }
  return <>{children}</>
}

function StaffLoginRoute({ auth }: { auth: StaffAuth }) {
  if (auth.session) return <Navigate to="/staff/tables" replace />

  return (
    <StaffLoginPage
      submitting={auth.submitting}
      error={auth.error}
      expired={auth.expired}
      onSubmit={(station, passcode) => {
        void auth.login(station, passcode)
      }}
      onDismissError={auth.clearError}
    />
  )
}

/**
 * The staff POS is a different app on the same bundle: its own Apps Script
 * deployment, its own token, and no customer session. It is mounted here only
 * so both share one router.
 */
function StaffTableHomeRoute({ auth }: { auth: StaffAuth }) {
  const staff = useStaffTableHome()
  const navigate = useNavigate()
  // Present on A02 (`/staff/tables/:tableId`), absent on A01.
  const { tableId } = useParams()
  const detail = useStaffTableDetail(tableId ?? null)

  /*
   * A rejected token cannot be recovered from this screen — drop the session
   * so the guard sends the operator to A09 instead of leaving them on an
   * alert they cannot act on.
   */
  useEffect(() => {
    if (!staff.unauthorized) return
    auth.logout()
    navigate('/staff/login', { replace: true })
  }, [auth, navigate, staff.unauthorized])

  return (
    <StaffTableHomePage
      data={staff.data}
      loading={staff.loading}
      errorMessage={staff.error?.message}
      retryable={staff.retryable}
      unauthorized={staff.unauthorized}
      acknowledgingTableId={staff.acknowledgingTableId}
      onRetry={staff.retry}
      onAcknowledge={staff.acknowledge}
      selectedTableId={tableId ?? null}
      onSelectTable={(next) => navigate(`/staff/tables/${next}`)}
      renderPanel={
        tableId
          ? (now) => (
              <TableDetailPanel
                detail={detail.detail}
                now={now}
                loading={detail.loading}
                statusPhase={detail.statusPhase}
                statusError={detail.statusError}
                onDismissStatusError={detail.dismissStatusError}
                acknowledging={staff.acknowledgingTableId === tableId}
                onClose={() => navigate('/staff/tables')}
                onAcknowledgeCall={staff.acknowledge}
                onStatusChange={detail.changeStatus}
                onAddOrder={() => navigate(`/staff/tables/${tableId}/order`)}
                onConfirmPayment={() =>
                  navigate(`/staff/tables/${tableId}/payment`)
                }
                onMove={() => navigate(`/staff/tables/${tableId}/move`)}
                onMerge={() => navigate(`/staff/tables/${tableId}/merge`)}
                onSplit={() => navigate(`/staff/tables/${tableId}/split`)}
                onDiscount={() => navigate(`/staff/tables/${tableId}/discount`)}
                onNote={() => navigate(`/staff/tables/${tableId}/note`)}
                onEditOrder={() => navigate(`/staff/tables/${tableId}/edit`)}
                onCancelOrder={() => navigate(`/staff/tables/${tableId}/cancel`)}
              />
            )
          : undefined
      }
    />
  )
}

function App() {
  const location = window.location
  // The staff POS shares the bundle but not the customer session.
  const isStaffRoute = location.pathname.startsWith('/staff')
  const initialTableMatch = location.pathname.match(/^\/t\/(T\d{2,})\/?$/)
  const initialToken = new URLSearchParams(location.search).get('token')
  const storedTableId = readStoredString(LAST_TABLE_ID_KEY)
  const storedToken = readStoredString(LAST_TOKEN_KEY)
  const [credentials, setCredentials] = useState<TableCredentials | null>(() => {
    if (isStaffRoute) return null
    return parseCredentials(initialTableMatch?.[1], initialToken) ??
      parseCredentials(storedTableId, storedToken)
  })
  const staffAuth = useStaffAuth()
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
  const staffCall = useStaffCall(credentials)
  const [callSheetOpen, setCallSheetOpen] = useState(false)
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
        <Route path="/staff" element={<Navigate to="/staff/tables" replace />} />
        <Route path="/staff/login" element={<StaffLoginRoute auth={staffAuth} />} />
        <Route
          path="/staff/tables"
          element={(
            <RequireStaffAuth auth={staffAuth}>
              <StaffTableHomeRoute auth={staffAuth} />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/tables/:tableId"
          element={(
            <RequireStaffAuth auth={staffAuth}>
              <StaffTableHomeRoute auth={staffAuth} />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/tables/:tableId/order"
          element={(
            <RequireStaffAuth auth={staffAuth}>
              <StaffAddOrderRoute />
            </RequireStaffAuth>
          )}
        />
        {/* A04–A08 all keep the table grid behind them. */}
        {(['move', 'merge', 'split', 'discount', 'edit', 'cancel'] as StaffOperation[]).map(
          (operation) => (
            <Route
              key={operation}
              path={`/staff/tables/:tableId/${operation}`}
              element={(
                <RequireStaffAuth auth={staffAuth}>
                  <StaffTableOperationRoute operation={operation} />
                </RequireStaffAuth>
              )}
            />
          ),
        )}
        {/* 메모 is the note half of the same A08 panel. */}
        <Route
          path="/staff/tables/:tableId/note"
          element={(
            <RequireStaffAuth auth={staffAuth}>
              <StaffTableOperationRoute operation="edit" />
            </RequireStaffAuth>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {callSheetOpen && (
        <CallStaffSheet
          tableNumber={tableNumber}
          phase={staffCall.phase}
          activeCall={staffCall.activeCall}
          error={staffCall.error}
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
