import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import './StaffStationPage.css'
import { StaffEmptyState } from '../../components/staff/StaffEmptyState'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import { StaffNavigation } from '../../components/staff/StaffNavigation'
import { staffNavItems } from '../../components/staff/staffNavItems'
import type { StaffStationCounts } from '../../types/staff'

export interface StationSection {
  id: string
  title: string
  count: number
  cards: ReactNode
  empty?: { title: string; body: string }
}

interface StaffStationPageProps {
  title: string
  summary: string | null
  counts: StaffStationCounts | null
  /** Unsettled staff, for the 서비스 rail badge. Null where unknown. */
  serviceCount?: number | null
  sections: StationSection[]
  loading: boolean
  errorMessage?: string
  onRetry: () => void
}

function useClock(): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return new Date(now).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * The shell B01 — Kitchen (91:415), B02 — Serving (91:600) and
 * B03 — Payment (91:723) share: the rail, a header with the station summary
 * and the clock, and one or two titled card sections underneath.
 */
export function StaffStationPage({
  title,
  summary,
  counts,
  serviceCount = null,
  sections,
  loading,
  errorMessage,
  onRetry,
}: StaffStationPageProps) {
  const clock = useClock()

  return (
    <div className="station-page" data-staff-app>
      <StaffNavigation items={staffNavItems(counts, { service: serviceCount })} />

      <main className="station-page__main">
        <header className="station-page__header">
          <h1 className="station-page__title">{title}</h1>
          {summary && <p className="station-page__summary">{summary}</p>}
          <p className="station-page__clock">{clock}</p>
        </header>

        <div className="station-page__body">
          {errorMessage && (
            <StaffInlineAlert
              title="최신 정보를 불러오지 못했어요. 화면의 내용은 마지막으로 확인된 상태입니다."
              detail={errorMessage}
              actionLabel="다시 시도"
              onAction={onRetry}
            />
          )}

          {loading && (
            <StaffEmptyState
              title="불러오는 중이에요"
              body="주문 대기열을 가져오고 있습니다"
            />
          )}

          {!loading &&
            sections.map((section) => (
              <section key={section.id} className="station-page__section">
                <div className="station-page__section-head">
                  <h2 className="station-page__section-title">
                    {section.title}
                  </h2>
                  <span className="station-page__section-count">
                    {section.count}
                  </span>
                </div>
                {section.count === 0 && section.empty ? (
                  <StaffEmptyState
                    title={section.empty.title}
                    body={section.empty.body}
                  />
                ) : (
                  <div className="station-page__cards">{section.cards}</div>
                )}
              </section>
            ))}
        </div>
      </main>
    </div>
  )
}
