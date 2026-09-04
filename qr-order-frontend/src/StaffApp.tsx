import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { TableDetailPanel } from './components/staff/TableDetailPanel'
import { StaffLoginPage } from './pages/staff/StaffLoginPage'
import { StaffTableOperationRoute } from './pages/staff/StaffOperationRoutes'
import type { StaffOperation } from './pages/staff/StaffOperationRoutes'
import {
  StaffServiceRoute,
  StaffSettlementRoute,
} from './pages/staff/StaffServiceRoutes'
import {
  StaffKitchenRoute,
  StaffPaymentRoute,
  StaffServingRoute,
} from './pages/staff/StaffStationRoutes'
import { StaffAvailabilityRoute } from './pages/staff/StaffAvailabilityRoute'
import { StaffTableHomePage } from './pages/staff/StaffTableHomePage'
import { StaffSettingsPage } from './pages/staff/StaffSettingsPage'
import { useStaffAuth } from './hooks/useStaffAuth'
import { useStaffTableDetail } from './hooks/useStaffTableDetail'
import { useStaffTableHome } from './hooks/useStaffTableHome'

type StaffAuth = ReturnType<typeof useStaffAuth>

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

function StaffTableHomeRoute({ auth }: { auth: StaffAuth }) {
  const staff = useStaffTableHome()
  const navigate = useNavigate()
  const { tableId } = useParams()
  const detail = useStaffTableDetail(tableId ?? null)

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
                onServiceOrder={() =>
                  navigate(`/staff/tables/${tableId}/service`)
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

function StaffApp() {
  const auth = useStaffAuth()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/staff" element={<Navigate to="/staff/tables" replace />} />
        <Route path="/staff/login" element={<StaffLoginRoute auth={auth} />} />
        <Route
          path="/staff/tables"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffTableHomeRoute auth={auth} />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/tables/:tableId"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffTableHomeRoute auth={auth} />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/tables/:tableId/service"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffServiceRoute />
            </RequireStaffAuth>
          )}
        />
        {(['move', 'merge', 'split', 'discount', 'edit', 'note', 'cancel'] as StaffOperation[]).map(
          (operation) => (
            <Route
              key={operation}
              path={`/staff/tables/:tableId/${operation}`}
              element={(
                <RequireStaffAuth auth={auth}>
                  <StaffTableOperationRoute operation={operation} />
                </RequireStaffAuth>
              )}
            />
          ),
        )}
        <Route
          path="/staff/kitchen"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffKitchenRoute />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/serving"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffServingRoute />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/payment"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffPaymentRoute />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/service"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffSettlementRoute />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/availability"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffAvailabilityRoute />
            </RequireStaffAuth>
          )}
        />
        <Route
          path="/staff/settings"
          element={(
            <RequireStaffAuth auth={auth}>
              <StaffSettingsPage />
            </RequireStaffAuth>
          )}
        />
        <Route path="*" element={<Navigate to="/staff/tables" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default StaffApp
