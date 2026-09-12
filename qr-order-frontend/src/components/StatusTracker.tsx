import type { OrderStatus } from '../types/order'

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
  // 완료 is terminal, so nothing pulses there.
  const live = status !== 'closed'

  return (
    <ol className="grid grid-cols-4 w-full m-0 p-0 list-none" aria-label="주문 진행 상태">
      {STEPS.map((step, index) => {
        const phase =
          index < currentIndex
            ? 'done'
            : index === currentIndex
              ? 'current'
              : 'upcoming'
        const filled = index <= currentIndex

        return (
          <li
            key={step.status}
            className="flex flex-col items-center gap-2"
            aria-current={phase === 'current' ? 'step' : undefined}
          >
            <div className="relative flex items-center justify-center w-full h-3.5">
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className={`absolute top-1/2 right-1/2 w-full h-0.5 -translate-y-1/2 rounded-[1px] ${
                    filled ? 'bg-primary' : 'bg-border-default'
                  }`}
                />
              )}
              {phase === 'current' && live && (
                <span
                  aria-hidden="true"
                  className="absolute size-3.5 rounded-full bg-primary animate-pulse-ring motion-reduce:animate-none motion-reduce:hidden"
                />
              )}
              <span
                aria-hidden="true"
                className={`relative z-[1] rounded-full ${
                  phase === 'current' ? 'size-3.5' : 'size-2.5'
                } ${filled ? 'bg-primary' : 'bg-border-default'}`}
              />
            </div>
            <span
              className={`text-[13px] leading-[19px] whitespace-nowrap ${
                phase === 'current'
                  ? 'font-bold text-strong'
                  : phase === 'done'
                    ? 'font-normal text-body'
                    : 'font-normal text-muted'
              }`}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
