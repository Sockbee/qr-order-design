import type { OrderStatus } from '../types/order'

type TrackableOrderStatus = Exclude<OrderStatus, 'cancelled'>

const STEPS: { status: TrackableOrderStatus; label: string }[] = [
  { status: 'accepted', label: '접수됨' },
  { status: 'preparing', label: '조리 중' },
  { status: 'served', label: '서빙 완료' },
  { status: 'closed', label: '완료' },
]

const PHASE_CLASSES = {
  done: 'bg-weak text-link',
  current: 'bg-primary text-on-primary',
  upcoming: 'bg-surface text-muted',
} as const

interface StatusTrackerProps {
  status: TrackableOrderStatus
}

export function StatusTracker({ status }: StatusTrackerProps) {
  const currentIndex = STEPS.findIndex((step) => step.status === status)

  return (
    <ol className="flex items-center gap-2 w-full m-0 p-0 list-none" aria-label="주문 진행 상태">
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
            className={`flex-none py-2 px-2.5 rounded-btn-sm text-sm leading-[21px] font-bold whitespace-nowrap ${PHASE_CLASSES[phase]}`}
            aria-current={phase === 'current' ? 'step' : undefined}
          >
            {step.label}
          </li>
        )
      })}
    </ol>
  )
}
