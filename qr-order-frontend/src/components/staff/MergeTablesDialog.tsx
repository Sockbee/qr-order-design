import { useState } from 'react'
import { ImpactNote, StaffDialog } from './StaffDialog'
import { TableFloorPlan } from './TableFloorPlan'
import './OperationDialogs.css'
import { formatStaffAmount } from '../../utils/price'
import type { StaffTableSummary } from '../../types/staff'

interface MergeTablesDialogProps {
  primary: StaffTableSummary
  tables: StaffTableSummary[]
  submitting: boolean
  onConfirm: (secondaryTableId: string) => void
  onCancel: () => void
}

/**
 * A05 — Merge Tables (95:1103).
 *
 * Add independent tables to one flat group; never nest existing groups.
 */
export function MergeTablesDialog({
  primary,
  tables,
  submitting,
  onConfirm,
  onCancel,
}: MergeTablesDialogProps) {
  const [secondaryId, setSecondaryId] = useState<string | null>(null)
  const secondary = tables.find((table) =>
    table.tableId === secondaryId && table.tableId !== primary.tableId &&
    !table.mergeLabel && !table.paid,
  ) ?? null

  const total = primary.amount + (secondary?.amount ?? 0)
  const primaryLabel = primary.mergeLabel?.replace(' 합석', '') ?? primary.tableId
  const label = secondary ? `${primaryLabel}+${secondary.tableId}` : primaryLabel

  return (
    <StaffDialog
      size="floor"
      title="테이블 합치기"
      confirmLabel="합치기"
      confirmDisabled={!secondary}
      submitting={submitting}
      onConfirm={() => secondary && onConfirm(secondary.tableId)}
      onCancel={onCancel}
    >
      <div className="operation-dialog__picked">
        <div className="operation-dialog__picked-card">
          <p className="operation-dialog__picked-table">{primaryLabel}</p>
          <p className="operation-dialog__picked-amount">
            {formatStaffAmount(primary.amount)}
          </p>
        </div>
        <div
          className={`operation-dialog__picked-card${
            secondary ? '' : ' operation-dialog__picked-card--empty'
          }`}
        >
          <p className="operation-dialog__picked-table">
            {secondary?.tableId ?? '?'}
          </p>
          <p className="operation-dialog__picked-amount">
            {secondary ? formatStaffAmount(secondary.amount) : '테이블 선택'}
          </p>
        </div>
      </div>

      <p className="operation-dialog__label">합석할 테이블 선택 · {label} · 현재 금액 합계 {formatStaffAmount(total)}</p>
      <div className="operation-dialog__floor">
        <TableFloorPlan
          tables={tables}
          selectedTableIds={[...primaryLabel.split('+'), ...(secondary ? [secondary.tableId] : [])]}
          onSelect={setSecondaryId}
          disabledReason={(table) => {
            if (table.tableId === primary.tableId) return '현재 테이블'
            if (table.mergeLabel) return '이미 합석'
            if (table.paid) return '결제 완료'
          }}
        />
      </div>

      <ImpactNote title="합치면 이렇게 됩니다">
        빈 테이블은 입장 전 미리 합칠 수 있으며, 입장 시간은 시작하지 않습니다. 합석한 모든 테이블에서 현재 방문의 기존 주문과 추가 주문내역을 함께 봅니다.
        현재 테이블의 할인율로 결제 금액을 합산합니다. 분리하면 각 테이블에서 접수한 주문만 남습니다.
      </ImpactNote>
    </StaffDialog>
  )
}
