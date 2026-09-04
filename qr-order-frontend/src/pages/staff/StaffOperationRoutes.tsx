import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { StaffTableHomePage } from './StaffTableHomePage'
import { DiscountDialog } from '../../components/staff/DiscountDialog'
import { EditOrderPanel } from '../../components/staff/EditOrderPanel'
import { MergeTablesDialog } from '../../components/staff/MergeTablesDialog'
import { MoveTableDialog } from '../../components/staff/MoveTableDialog'
import { SplitTablesDialog } from '../../components/staff/SplitTablesDialog'
import { ConfirmDialog } from '../../components/staff/StaffDialog'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import { TableMemoPanel } from '../../components/staff/TableMemoPanel'
import { useStaffOperations } from '../../hooks/useStaffOperations'
import { useStaffTableDetail } from '../../hooks/useStaffTableDetail'
import { useStaffTableHome } from '../../hooks/useStaffTableHome'
import { formatStaffAmount } from '../../utils/price'
import type { StaffNoteAudience } from '../../types/staff'

/**
 * A03–A08 all act on one table, and all of them keep the table grid on
 * screen behind them. They share this shell so the grid, the poll and the
 * call strip are one instance rather than six.
 */
export type StaffOperation =
  | 'move'
  | 'merge'
  | 'split'
  | 'discount'
  | 'edit'
  | 'note'
  | 'cancel'

/** §4.13 allows one configured rate; 20 is the seeded value. */
const TABLE_DISCOUNT_RATE = 20

export function StaffTableOperationRoute({
  operation,
}: {
  operation: StaffOperation
}) {
  const { tableId = '' } = useParams()
  const navigate = useNavigate()
  const staff = useStaffTableHome()
  const detail = useStaffTableDetail(tableId)
  const operations = useStaffOperations()
  const [noteAudience, setNoteAudience] =
    useState<StaffNoteAudience | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [cancelItemId, setCancelItemId] = useState<string | null>(null)

  const latestNote = detail.detail?.notes.at(-1)
  const currentNote = note ?? latestNote?.text ?? ''
  const currentNoteAudience = noteAudience ?? latestNote?.audience ?? 'general'

  const close = () => navigate(`/staff/tables/${tableId}`)
  const table = staff.data?.tables.find(
    (candidate) => candidate.tableId === tableId,
  )
  const tables = staff.data?.tables ?? []
  const orderCount = detail.detail?.items.length ?? 0

  const home = (extra?: {
    panel?: React.ReactNode
  }) => (
    <StaffTableHomePage
      data={staff.data}
      loading={staff.loading}
      errorMessage={operations.error ?? staff.error?.message}
      retryable={staff.retryable}
      unauthorized={staff.unauthorized}
      acknowledgingTableId={staff.acknowledgingTableId}
      onRetry={staff.retry}
      onAcknowledge={staff.acknowledge}
      selectedTableId={tableId}
      onSelectTable={(next) => navigate(`/staff/tables/${next}`)}
      renderPanel={extra?.panel ? () => extra.panel : undefined}
    />
  )

  if (!table && staff.data) return <Navigate to="/staff/tables" replace />

  if (operation === 'edit') {
    const cancellingItem = detail.detail?.items.find(
      (item) => item.itemId === cancelItemId,
    )
    return (
      <>
        {home({
          panel: (
            <EditOrderPanel
              tableId={tableId}
              items={detail.detail?.items ?? []}
              onQuantityChange={(itemId, quantity) =>
                operations.quantity(itemId, quantity, detail.reload)
              }
              onCancelItem={setCancelItemId}
              onClose={close}
            />
          ),
        })}
        {cancellingItem && (
          <ConfirmDialog
            title={`${cancellingItem.name} 항목을 취소할까요?`}
            body={`${cancellingItem.quantity}개 ${formatStaffAmount(
              cancellingItem.amount,
            )} 항목이 취소 이력으로 남고 결제 금액에서 제외됩니다.`}
            confirmLabel="항목 취소"
            submitting={operations.submitting}
            onConfirm={() =>
              operations.cancelItem(cancellingItem.itemId, () => {
                setCancelItemId(null)
                detail.reload()
              })
            }
            onCancel={() => setCancelItemId(null)}
          />
        )}
      </>
    )
  }

  if (operation === 'note') {
    return home({
      panel: (
        <TableMemoPanel
          tableId={tableId}
          note={currentNote}
          noteAudience={currentNoteAudience}
          saving={operations.submitting}
          onNoteChange={setNote}
          onAudienceChange={setNoteAudience}
          onSave={() =>
            operations.saveNote(tableId, currentNote, currentNoteAudience, close)
          }
          onClose={close}
        />
      ),
    })
  }

  return (
    <>
      {home()}
      {operations.error && (
        <div className="staff-operation-error">
          <StaffInlineAlert
            title="작업을 완료하지 못했어요"
            detail={operations.error}
            actionLabel="닫기"
            onAction={operations.clearError}
          />
        </div>
      )}
      {table && operation === 'move' && (
        <MoveTableDialog
          source={table}
          orderCount={orderCount}
          tables={tables}
          submitting={operations.submitting}
          onConfirm={(to) => operations.move(tableId, to, close)}
          onCancel={close}
        />
      )}
      {table && operation === 'merge' && (
        <MergeTablesDialog
          primary={table}
          tables={tables}
          orderCount={orderCount}
          submitting={operations.submitting}
          onConfirm={(secondary) =>
            operations.merge(tableId, secondary, close)
          }
          onCancel={close}
        />
      )}
      {table && operation === 'split' && (
        <SplitTablesDialog
          groupLabel={table.mergeLabel?.replace(' 합석', '') ?? tableId}
          total={table.amount}
          totalOrderCount={orderCount}
          members={(table.mergeLabel?.replace(' 합석', '').split('+') ?? [
            tableId,
          ]).map((member) => ({
            tableId: member,
            amount:
              tables.find((candidate) => candidate.tableId === member)
                ?.amount ?? 0,
            orderCount:
              tables.find((candidate) => candidate.tableId === member)
                ?.pendingItemCount ?? 0,
          }))}
          submitting={operations.submitting}
          onConfirm={() => operations.split(tableId, close)}
          onCancel={close}
        />
      )}
      {table && operation === 'discount' && (
        <DiscountDialog
          tableId={tableId}
          subtotalAmount={detail.detail?.bill.subtotalAmount ?? table.amount}
          tableDiscountRate={TABLE_DISCOUNT_RATE}
          currentRate={detail.detail?.bill.discountRate ?? 0}
          submitting={operations.submitting}
          onConfirm={(rate) => operations.discount(tableId, rate, close)}
          onCancel={close}
        />
      )}
      {table && operation === 'cancel' && (
        <ConfirmDialog
          title={`${tableId} 주문을 전체 취소할까요?`}
          body={`주문 ${orderCount}건 ${formatStaffAmount(
            detail.detail?.bill.finalAmount ?? table.amount,
          )}이 취소됩니다. 이미 조리된 항목이 있다면 주방에 먼저 알려주세요.`}
          confirmLabel="전체 취소"
          submitting={operations.submitting}
          onConfirm={() => operations.cancelOrders(tableId, close)}
          onCancel={close}
        />
      )}
    </>
  )
}
