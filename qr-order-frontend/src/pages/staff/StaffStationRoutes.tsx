import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { StaffStationPage } from './StaffStationPage'
import { PaymentOrderCard } from '../../components/staff/PaymentOrderCard'
import { StationOrderCard } from '../../components/staff/StationOrderCard'
import { useStaffStations } from '../../hooks/useStaffStations'
import {
  elapsedLevel,
  KITCHEN_ELAPSED,
  SERVING_ELAPSED,
} from '../../utils/elapsed'
import type { ElapsedThresholds } from '../../utils/elapsed'
import type { StaffStationOrder } from '../../types/staff'

function useStations() {
  const stations = useStaffStations()
  const navigate = useNavigate()

  // A rejected token cannot be recovered from a station screen.
  useEffect(() => {
    if (stations.unauthorized) navigate('/staff/login', { replace: true })
  }, [navigate, stations.unauthorized])

  return stations
}

const delayedCount = (
  orders: StaffStationOrder[],
  thresholds: ElapsedThresholds,
) =>
  orders.filter(
    (order) => elapsedLevel(order.elapsedMinutes, thresholds) === 'delayed',
  ).length

/** B01 — Kitchen (91:415). */
export function StaffKitchenRoute() {
  const stations = useStations()
  const fresh = stations.kitchen.filter((order) => order.status === 'new')
  const cooking = stations.kitchen.filter((order) => order.status === 'cooking')

  return (
    <StaffStationPage
      title="주방"
      summary={
        stations.kitchen.length > 0 || !stations.loading
          ? `신규 ${fresh.length} · 조리 중 ${cooking.length} · 지연 ${delayedCount(stations.kitchen, KITCHEN_ELAPSED)}`
          : null
      }
      counts={stations.counts}
      loading={stations.loading}
      errorMessage={stations.error?.message}
      onRetry={stations.retry}
      sections={[
        {
          id: 'new',
          title: '신규 주문',
          count: fresh.length,
          empty: {
            title: '새 주문이 없어요',
            body: '주문이 들어오면 여기에 바로 표시됩니다',
          },
          cards: fresh.map((order) => (
            <StationOrderCard
              key={order.orderId}
              order={order}
              actionLabel="조리 시작"
              noteAudience="kitchen"
              thresholds={KITCHEN_ELAPSED}
              busy={stations.busyId === order.orderId}
              onAction={(id) => stations.advance(id, 'cooking')}
            />
          )),
        },
        {
          id: 'cooking',
          title: '조리 중',
          count: cooking.length,
          empty: {
            title: '조리할 주문이 없어요',
            body: '새 주문이 들어오면 여기에 바로 표시됩니다',
          },
          cards: cooking.map((order) => (
            <StationOrderCard
              key={order.orderId}
              order={order}
              actionLabel="조리 완료"
              actionVariant="secondary"
              noteAudience="kitchen"
              thresholds={KITCHEN_ELAPSED}
              busy={stations.busyId === order.orderId}
              onAction={(id) => stations.advance(id, 'ready')}
            />
          )),
        },
      ]}
    />
  )
}

/** B02 — Serving (91:600). */
export function StaffServingRoute() {
  const stations = useStations()

  return (
    <StaffStationPage
      title="서빙"
      summary={
        stations.loading
          ? null
          : `서빙 대기 ${stations.serving.length} · 지연 ${delayedCount(stations.serving, SERVING_ELAPSED)}`
      }
      counts={stations.counts}
      loading={stations.loading}
      errorMessage={stations.error?.message}
      onRetry={stations.retry}
      sections={[
        {
          id: 'ready',
          title: '서빙 대기',
          count: stations.serving.length,
          empty: {
            title: '서빙할 주문이 없어요',
            body: '조리가 끝나면 여기에 바로 표시됩니다',
          },
          cards: stations.serving.map((order) => (
            <StationOrderCard
              key={order.orderId}
              order={order}
              actionLabel="서빙 완료"
              noteAudience="serving"
              elapsedSuffix="대기"
              thresholds={SERVING_ELAPSED}
              busy={stations.busyId === order.orderId}
              onAction={(id) => stations.advance(id, 'served')}
            />
          )),
        },
      ]}
    />
  )
}

/** B03 — Payment (91:723). */
export function StaffPaymentRoute() {
  const stations = useStations()
  const pending = stations.payment.filter((row) => !row.bill.paid)
  const done = stations.payment.filter((row) => row.bill.paid)

  return (
    <StaffStationPage
      title="결제"
      summary={
        stations.loading
          ? null
          : `결제 대기 ${pending.length} · 오늘 완료 ${done.length}`
      }
      counts={stations.counts}
      loading={stations.loading}
      errorMessage={stations.error?.message}
      onRetry={stations.retry}
      sections={[
        {
          id: 'pending',
          title: '결제 대기',
          count: pending.length,
          empty: {
            title: '결제 대기 중인 테이블이 없어요',
            body: '서빙이 끝난 테이블이 여기에 표시됩니다',
          },
          cards: pending.map((order) => (
            <PaymentOrderCard
              key={order.tableId}
              order={order}
              busy={stations.busyId === order.tableId}
              onConfirm={stations.confirmPayment}
            />
          )),
        },
        {
          id: 'done',
          title: '결제 완료',
          count: done.length,
          cards: done.map((order) => (
            <PaymentOrderCard
              key={order.tableId}
              order={order}
              busy={false}
              onConfirm={stations.confirmPayment}
            />
          )),
        },
      ]}
    />
  )
}
