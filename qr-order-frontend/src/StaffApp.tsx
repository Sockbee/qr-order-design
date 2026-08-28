import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import { StaffLoginPage } from './pages/staff/StaffLoginPage'
import { StaffTableHomePage } from './pages/staff/StaffTableHomePage'
import { useStaffAuth } from './hooks/useStaffAuth'
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
        <Route path="*" element={<Navigate to="/staff/tables" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default StaffApp
