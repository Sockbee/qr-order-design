import type { OrderStatus } from '../types/order'
import './StatusTracker.css'

type TrackableOrderStatus = Exclude<OrderStatus, 'cancelled'>

const STEPS: { status: TrackableOrderStatus; label: string }[] = [
  { status: 'accepted', label: '접수됨' },
  { status: 'preparing', label: '조리 중' },
  { status: 'served', label: '서빙 완료' },
  { status: 'closed', label: '완료' },
]

interface StatusTrackerProps {
  status: TrackableOrderStatus
}

export function StatusTracker({ status }: StatusTrackerProps) {
  const currentIndex = STEPS.findIndex((step) => step.status === status)

  return (
    <ol className="status-tracker" aria-label="주문 진행 상태">
      {STEPS.map((step, index) => {
        const phase =
          index < currentIndex
            ? 'done'
            : index === currentIndex
              ? 'current'
              : 'upcoming'

        return (
          <li
            key={step.status}
            className={`status-tracker__chip status-tracker__chip--${phase}`}
            aria-current={phase === 'current' ? 'step' : undefined}
          >
            {step.label}
          </li>
        )
      })}
    </ol>
  )
}
