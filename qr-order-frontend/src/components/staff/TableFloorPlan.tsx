import { visitElapsed, departureLabel } from '../../utils/tableVisit'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FLOOR_WIDTH, FLOOR_HEIGHT, getHanshinFloorPlan } from '../../data/hanshinFloorPlan'
import { useFloorPlanView } from '../../hooks/useFloorPlanView'
import { isDelayed } from '../../api/staff/tables'
import { formatStaffAmount } from '../../utils/price'
import type { StaffTableSummary } from '../../types/staff'
import { TableCard } from './TableCard'
import diamondActive from '../../assets/staff/table-diamond-active.svg'
import diamondEmpty from '../../assets/staff/table-diamond-empty.svg'
import './TableFloorPlan.css'

interface TableFloorPlanProps {
  tables: StaffTableSummary[]
  selectedTableIds?: string[]
  onSelect?: (tableId: string) => void
  disabledReason?: (table: StaffTableSummary) => string | undefined
  label?: string
}

/** Shared by the home, inspector backdrops, and move/merge pickers. */
export function TableFloorPlan({
  tables,
  selectedTableIds = [],
  onSelect,
  disabledReason,
  label = '테이블 배치도',
}: TableFloorPlanProps) {
  const [view, setView] = useFloorPlanView()
  const floor = getHanshinFloorPlan(view)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer) }, [])
  const viewport = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.64)
  useLayoutEffect(() => {
    const node = viewport.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      // Keep every touch target at least 48px. Small viewports scroll the map.
      setScale(Math.max(0.64, Math.min(
        (entry.contentRect.width - 32) / FLOOR_WIDTH,
        entry.contentRect.height / FLOOR_HEIGHT,
      )))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const mappedIds = new Set(floor.tables.map((position) => position.tableId))
  const extras = tables.filter((table) => !mappedIds.has(table.tableId))

  return (
    <section className="table-floor-plan" aria-label={label}>
      <header className="table-floor-plan__header">
        <h2 className="table-floor-plan__title">소프트 한신포차 · {floor.tables.length}테이블 · 4인 기준</h2>
        <label className="table-floor-plan__view">
          보기 방향
          <select value={view} onChange={(event) => setView(event.target.value === 'window' ? 'window' : 'pos')}>
            <option value="pos">POS → 입구</option>
            <option value="window">창문 쪽에서 보기</option>
          </select>
        </label>
      </header>
      <div ref={viewport} className="table-floor-plan__viewport">
        <div className="table-floor-plan__canvas" style={{
          width: FLOOR_WIDTH * scale, height: FLOOR_HEIGHT * scale, '--floor-scale': scale,
        } as CSSProperties}>
          {floor.landmarks.map((mark) => (
            <span key={mark.label} className="table-floor-plan__landmark" style={{
              left: (mark.x - mark.width / 2) * scale, top: (mark.y - mark.height / 2) * scale,
              width: mark.width * scale, height: mark.height * scale,
            }}>{mark.label}</span>
          ))}
          <span className="table-floor-plan__event" style={{
            left: (floor.event.x - floor.event.width / 2) * scale,
            top: (floor.event.y - floor.event.height / 2) * scale,
            width: floor.event.width * scale, height: floor.event.height * scale,
          }} aria-label="이벤트 공간 · 주문 테이블 아님">이벤트</span>
          {floor.tables.map((position) => {
            const table = tables.find((item) => item.tableId === position.tableId)
            const reason = table ? disabledReason?.(table) : '미등록 또는 비활성 테이블'
            const selected = selectedTableIds.includes(position.tableId)
            const delayed = table ? isDelayed(table) : false
            const occupied = table?.occupied ?? false
            const details = [
              table?.displayName ?? position.tableId, '4인',
              occupied ? formatStaffAmount(table?.amount ?? 0) : '비어 있음',
              visitElapsed(table?.openedAt, now), table?.occupied ? departureLabel(table.departureAt, now) : '',
              table?.mergeLabel, table?.hasCall ? '직원 호출' : '',
              delayed ? `${table?.elapsedMinutes}분 지연` : '', reason,
            ].filter(Boolean).join(', ')
            return (
              <button
                key={position.tableId}
                type="button"
                className={[
                  'table-floor-plan__table', `table-floor-plan__table--${position.shape}`,
                  !occupied && 'table-floor-plan__table--empty',
                  delayed && 'table-floor-plan__table--delayed',
                  table?.mergeLabel && 'table-floor-plan__table--merged',
                  selected && 'table-floor-plan__table--selected',
                ].filter(Boolean).join(' ')}
                style={{
                  left: (position.x - position.width / 2) * scale,
                  top: (position.y - position.height / 2) * scale,
                  width: position.width * scale, height: position.height * scale,
                }}
                aria-label={details}
                aria-pressed={selected}
                title={details}
                disabled={Boolean(reason) || !onSelect}
                onClick={() => onSelect?.(position.tableId)}
                data-table-id={position.tableId}
              >
                {position.shape === 'diamond' && <img
                  className="table-floor-plan__diamond" src={occupied ? diamondActive : diamondEmpty} alt=""
                />}
                <span className="table-floor-plan__number">{position.tableId}</span>
                {occupied && <span className="table-floor-plan__amount">{formatStaffAmount(table?.amount ?? 0)}</span>}
                <span className="table-floor-plan__capacity">
                  {!table ? '미등록' : `4인${table.mergeLabel ? ' · 합석' : delayed ? ' · 지연' : ''}`}
                </span>
                {occupied && <span className="table-floor-plan__time">{visitElapsed(table?.openedAt, now) ?? `입장 ${table?.elapsedMinutes ?? 0}분 경과`}</span>}
                {occupied && <span className="table-floor-plan__time">{departureLabel(table?.departureAt, now)}</span>}
                {table?.hasCall && <span className="table-floor-plan__call">호출</span>}
              </button>
            )
          })}
        </div>
        {extras.length > 0 && <section className="table-floor-plan__extras" aria-label="배치도 외 테이블">
          <h3>배치도 외 테이블</h3>
          {extras.map((table) => <TableCard key={table.tableId} table={table} now={now}
            selected={selectedTableIds.includes(table.tableId)}
            onSelect={disabledReason?.(table) ? undefined : onSelect} />)}
        </section>}
      </div>
      <p className="table-floor-plan__caption">기본 {floor.tables.length * 4}석 · 이벤트 공간 별도 · 단체는 테이블 합치기</p>
    </section>
  )
}
