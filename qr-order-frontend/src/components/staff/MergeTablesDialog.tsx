import { useState } from 'react'
import { DialogSummary, ImpactNote, StaffDialog } from './StaffDialog'
import { TableChoice } from './TableChoice'
import './OperationDialogs.css'
import { formatStaffAmount } from '../../utils/price'
import type { StaffTableSummary } from '../../types/staff'

interface MergeTablesDialogProps {
  primary: StaffTableSummary
  tables: StaffTableSummary[]
  orderCount: number
  submitting: boolean
  onConfirm: (secondaryTableId: string) => void
  onCancel: () => void
}

/**
 * A05 — Merge Tables (95:1103).
 *
 * Merging is one level deep only (§4.15): a table that is already part of a
 * group cannot be merged again, so those are offered but not selectable.
 */
export function MergeTablesDialog({
  primary,
  tables,
  orderCount,
  submitting,
  onConfirm,
  onCancel,
}: MergeTablesDialogProps) {
  const [secondaryId, setSecondaryId] = useState<string | null>(null)
  const secondary =
    tables.find((table) => table.tableId === secondaryId) ?? null

  const candidates = tables.filter(
    (table) => table.tableId !== primary.tableId,
  )
  const total = primary.amount + (secondary?.amount ?? 0)
  const label = secondary
    ? `${primary.tableId}+${secondary.tableId}`
    : primary.tableId

  return (
    <StaffDialog
      title="테이블 합치기"
      confirmLabel="합치기"
      confirmDisabled={!secondary}
      submitting={submitting}
      onConfirm={() => secondary && onConfirm(secondary.tableId)}
      onCancel={onCancel}
    >
      <div className="operation-dialog__picked">
        <div className="operation-dialog__picked-card">
          <p className="operation-dialog__picked-table">{primary.tableId}</p>
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

      <p className="operation-dialog__label">합석할 테이블 선택</p>
      <div className="operation-dialog__choices">
        {candidates.map((table) => (
          <TableChoice
            key={table.tableId}
            tableId={table.tableId}
            caption={
              table.mergeLabel
                ? '이미 합석'
                : table.occupied
                  ? '사용 중'
                  : '비어 있음'
            }
            /* Empty tables have nothing to merge, and chains are rejected. */
            disabled={!table.occupied || Boolean(table.mergeLabel)}
            selected={table.tableId === secondaryId}
            onSelect={setSecondaryId}
          />
        ))}
      </div>

      <DialogSummary
        label="합친 결과"
        table={label}
        meta={`${formatStaffAmount(total)} · 주문 ${orderCount}건`}
      />

      <ImpactNote title="합치면 이렇게 됩니다">
        주문은 원래 테이블 기준으로 그대로 남고 결제 금액만 합산됩니다. 홈에서 두
        테이블은 일반 테이블이 아니라 합석 카드로 함께 표시됩니다.
      </ImpactNote>
    </StaffDialog>
  )
}
