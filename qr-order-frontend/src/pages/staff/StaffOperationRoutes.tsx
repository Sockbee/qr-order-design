import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { StaffTableHomePage } from './StaffTableHomePage'
import { StaffAddOrderPage } from './StaffAddOrderPage'
import type { OrderDraftLine } from './StaffAddOrderPage'
import { DiscountDialog } from '../../components/staff/DiscountDialog'
import { EditOrderPanel } from '../../components/staff/EditOrderPanel'
import { MergeTablesDialog } from '../../components/staff/MergeTablesDialog'
import { MoveTableDialog } from '../../components/staff/MoveTableDialog'
import { SplitTablesDialog } from '../../components/staff/SplitTablesDialog'
import { ConfirmDialog } from '../../components/staff/StaffDialog'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import { useStaffMenu } from '../../hooks/useStaffMenu'
import { useStaffOperations } from '../../hooks/useStaffOperations'
import { useStaffTableDetail } from '../../hooks/useStaffTableDetail'
import { useStaffTableHome } from '../../hooks/useStaffTableHome'
import { createStaffOrder } from '../../api/staff/menu'
import { hasStaffApi } from '../../api/staff/client'
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
    useState<StaffNoteAudience>('general')
  const [note, setNote] = useState('')

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
    return home({
      panel: (
        <EditOrderPanel
          tableId={tableId}
          items={detail.detail?.items ?? []}
          note={note}
          noteAudience={noteAudience}
          savingNote={false}
          onQuantityChange={() => {
            /* Wired when orders/items exists — see the PR document. */
          }}
          onCancelItem={() => navigate(`/staff/tables/${tableId}/cancel`)}
          onNoteChange={setNote}
          onAudienceChange={setNoteAudience}
          onSaveNote={close}
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
          onConfirm={close}
          onCancel={close}
        />
      )}
    </>
  )
}

/** A03 — Add Order. A full screen of its own, not a dialog. */
export function StaffAddOrderRoute() {
  const { tableId = '' } = useParams()
  const navigate = useNavigate()
  const menu = useStaffMenu()
  const [draft, setDraft] = useState<OrderDraftLine[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const close = () => navigate(`/staff/tables/${tableId}`)

  const add = (itemId: string) => {
    const item = menu.items.find((candidate) => candidate.id === itemId)
    if (!item) return
    setDraft((current) => {
      const existing = current.find((line) => line.itemId === itemId)
      if (existing) {
        return current.map((line) =>
          line.itemId === itemId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        )
      }
      return [
        ...current,
        {
          itemId,
          name: item.name,
          optionSummary: '기본',
          unitPrice: item.price,
          quantity: 1,
        },
      ]
    })
  }

  const changeQuantity = (itemId: string, quantity: number) => {
    setDraft((current) =>
      quantity <= 0
        ? current.filter((line) => line.itemId !== itemId)
        : current.map((line) =>
            line.itemId === itemId ? { ...line, quantity } : line,
          ),
    )
  }

  const submit = () => {
    if (!hasStaffApi()) {
      close()
      return
    }
    setSubmitting(true)
    void createStaffOrder(
      tableId,
      draft.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
      note.trim() || null,
    )
      .then(close)
      .finally(() => setSubmitting(false))
  }

  return (
    <StaffAddOrderPage
      tableId={tableId}
      categories={menu.categories}
      items={menu.items}
      draft={draft}
      note={note}
      submitting={submitting}
      togglingItemId={menu.toggling}
      onAdd={add}
      onQuantityChange={changeQuantity}
      onNoteChange={setNote}
      onSetSoldOut={menu.setSoldOut}
      onSubmit={submit}
      onClose={close}
    />
  )
}
