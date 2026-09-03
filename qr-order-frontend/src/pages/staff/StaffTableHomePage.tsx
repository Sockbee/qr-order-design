import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import './StaffTableHomePage.css'
import { CallRow } from '../../components/staff/CallRow'
import { StaffEmptyState } from '../../components/staff/StaffEmptyState'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import { StaffNavigation } from '../../components/staff/StaffNavigation'
import { staffNavItems } from '../../components/staff/staffNavItems'
import { TableCard } from '../../components/staff/TableCard'
import { TableCardSkeleton } from '../../components/staff/TableCardSkeleton'
import type { StaffTableHomeData } from '../../types/staff'

interface StaffTableHomePageProps {
  data: StaffTableHomeData | null
  loading: boolean
  errorMessage?: string
  retryable: boolean
  unauthorized: boolean
  acknowledgingTableId: string | null
  onRetry: () => void
  onAcknowledge: (tableId: string) => void
  onSelectTable?: (tableId: string) => void
  /**
   * The A02 inspector. Absent on A01, which is the same screen without it.
   * Takes the page clock so the panel's elapsed labels tick with the header's.
   */
  renderPanel?: (now: number) => ReactNode
  /** Highlighted while its detail is open. */
  selectedTableId?: string | null
}

const SKELETON_COUNT = 15

/**
 * One clock for the whole screen: the header time and every row's elapsed
 * label move together, and nothing reads the wall clock during render.
 */
function useClock(): { label: string; now: number } {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return {
    now,
    label: new Date(now).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  }
}

/**
 * A01 — Table Home (90:2). The floor at a glance: the rail on the left, the
 * summary and the clock in the header, unacknowledged calls as a strip, and
 * the table grid underneath.
 */
export function StaffTableHomePage({
  data,
  loading,
  errorMessage,
  retryable,
  unauthorized,
  acknowledgingTableId,
  onRetry,
  onAcknowledge,
  onSelectTable,
  renderPanel,
  selectedTableId = null,
}: StaffTableHomePageProps) {
  const { label: clock, now } = useClock()
  const pendingCalls = data?.callGroups ?? []
  const attentionCount = data?.stationCounts.tables ?? 0

  return (
    <div
      className={`staff-home${renderPanel ? ' staff-home--with-panel' : ''}`}
      data-staff-app
    >
      <StaffNavigation
        items={staffNavItems(
          data
            ? {
                // No data yet means no count — not a count of zero.
                ...data.stationCounts,
                tables: attentionCount,
              }
            : null,
        )}
      />

      <main className="staff-home__main">
        <header className="staff-home__header">
          <h1 className="staff-home__title">테이블</h1>
          {data && (
            <p className="staff-home__summary">
              {`활성 ${data.activeTableCount} · 호출 ${data.callingTableCount} · 미처리 ${data.pendingItemCount} · 지연 ${data.delayedTableCount}`}
            </p>
          )}
          <p className="staff-home__clock">{clock}</p>
        </header>

        {errorMessage && (
          <div className="staff-home__alert">
            <StaffInlineAlert
              /*
               * A failure has to say what broke AND what is still true. The
               * "last confirmed state" half is only honest when something is
               * actually on screen (FailureAlert, 99:1551).
               */
              title={
                unauthorized
                  ? '로그인이 만료됐어요.'
                  : data
                    ? '최신 정보를 불러오지 못했어요. 화면의 내용은 마지막으로 확인된 상태입니다.'
                    : '테이블 현황을 불러오지 못했어요.'
              }
              detail={errorMessage}
              actionLabel={unauthorized || !retryable ? undefined : '다시 시도'}
              onAction={unauthorized || !retryable ? undefined : onRetry}
            />
          </div>
        )}

        {/* No calls: the strip disappears. It never leaves an empty shell. */}
        {pendingCalls.length > 0 && (
          <section className="staff-home__calls" aria-label="직원 호출">
            <div className="staff-home__calls-head">
              <h2 className="staff-home__calls-title">직원 호출</h2>
              <span className="staff-home__calls-count">
                {data?.callingTableCount ?? 0}
              </span>
            </div>
            <ul className="staff-home__call-rows">
              {pendingCalls.map((group) => (
                <CallRow
                  key={group.tableId}
                  group={group}
                  now={now}
                  acknowledging={acknowledgingTableId === group.tableId}
                  onAcknowledge={onAcknowledge}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="staff-home__grid" aria-label="테이블 목록">
          {loading &&
            Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <TableCardSkeleton key={index} />
            ))}

          {!loading &&
            data?.tables.map((table) => (
              <TableCard
                key={table.tableId}
                table={table}
                selected={table.tableId === selectedTableId}
                onSelect={onSelectTable}
              />
            ))}

          {!loading && data?.tables.length === 0 && (
            <StaffEmptyState
              title="아직 열린 테이블이 없어요"
              body="손님이 QR을 스캔해 주문하면 여기에 테이블이 나타납니다"
            />
          )}

          {/*
            * Not drawn in Figma: a first load that fails leaves nothing to
            * show, and an unexplained empty floor reads as "no tables" rather
            * than "could not load". The alert above says what broke; this
            * says what the operator should do about it.
            */}
          {!loading && !data && (
            <StaffEmptyState
              title="테이블 현황을 표시할 수 없어요"
              body={
                unauthorized
                  ? '운영 기기에 다시 로그인한 뒤 열어주세요'
                  : '연결이 복구되면 자동으로 다시 불러옵니다'
              }
            />
          )}
        </section>
      </main>

      {renderPanel?.(now)}
    </div>
  )
}
