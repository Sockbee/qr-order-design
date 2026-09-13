import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { HANSHIN_LANDMARKS, HANSHIN_TABLES } from '../../data/hanshinFloorPlan'
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
  const viewport = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.64)
  useLayoutEffect(() => {
    const node = viewport.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      // Keep every touch target at least 48px. Small viewports scroll the map.
      setScale(Math.max(0.64, Math.min(
        (entry.contentRect.width - 32) / 1000,
        entry.contentRect.height / 600,
      )))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const mappedIds = new Set(HANSHIN_TABLES.map((position) => position.tableId))
  const extras = tables.filter((table) => !mappedIds.has(table.tableId))

  return (
    <section className="table-floor-plan" aria-label={label}>
      <h2 className="table-floor-plan__title">소프트 한신포차 · 24테이블 · 4인 기준</h2>
      <div ref={viewport} className="table-floor-plan__viewport">
        <div className="table-floor-plan__canvas" style={{
          width: 1000 * scale, height: 600 * scale, '--floor-scale': scale,
        } as CSSProperties}>
          {HANSHIN_LANDMARKS.map((mark) => (
            <span key={mark.label} className="table-floor-plan__landmark" style={{
              left: mark.x * scale, top: mark.y * scale,
              width: mark.width * scale, height: 32 * scale,
            }}>{mark.label}</span>
          ))}
          {HANSHIN_TABLES.map((position) => {
            const table = tables.find((item) => item.tableId === position.tableId)
            const reason = table ? disabledReason?.(table) : '미등록 또는 비활성 테이블'
            const selected = selectedTableIds.includes(position.tableId)
            const delayed = table ? isDelayed(table) : false
            const occupied = table?.occupied ?? false
            const details = [
              table?.displayName ?? position.tableId, '4인',
              occupied ? formatStaffAmount(table?.amount ?? 0) : '비어 있음',
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
                {table?.hasCall && <span className="table-floor-plan__call">호출</span>}
              </button>
            )
          })}
        </div>
        {extras.length > 0 && <section className="table-floor-plan__extras" aria-label="배치도 외 테이블">
          <h3>배치도 외 테이블</h3>
          {extras.map((table) => <TableCard key={table.tableId} table={table}
            selected={selectedTableIds.includes(table.tableId)}
            onSelect={disabledReason?.(table) ? undefined : onSelect} />)}
        </section>}
      </div>
      <p className="table-floor-plan__caption">기본 96석 · 단체는 테이블 합치기</p>
    </section>
  )
}
