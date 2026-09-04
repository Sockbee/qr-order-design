import './TableDetailPanel.css'
import { OperationalButton } from './OperationalButton'
import { OrderNote } from './OrderNote'
import { OrderStatusDropdown } from './OrderStatusDropdown'
import { StaffEmptyState } from './StaffEmptyState'
import { StaffInlineAlert } from './StaffInlineAlert'
import { StaffOrderItem } from './StaffOrderItem'
import { callReasonLabel } from '../../types/call'
import { formatStaffAmount } from '../../utils/price'
import type { StaffOrderStatus, StaffTableDetail } from '../../types/staff'

export interface TableDetailActions {
  onClose: () => void
  onAcknowledgeCall: (tableId: string) => void
  onStatusChange: (status: StaffOrderStatus) => void
  /** A10 — grant a service order this table is not billed for. */
  onServiceOrder: () => void
  onMove: () => void
  onMerge: () => void
  onSplit: () => void
  onDiscount: () => void
  onNote: () => void
  onEditOrder: () => void
  onCancelOrder: () => void
}

interface TableDetailPanelProps extends TableDetailActions {
  detail: StaffTableDetail | null
  /** Ticked by the page clock — reading it here would be impure. */
  now: number
  loading: boolean
  statusPhase: 'idle' | 'updating' | 'success'
  /** A failed status change; the panel keeps showing the previous status. */
  statusError: string | null
  onDismissStatusError: () => void
  acknowledging: boolean
}

function elapsedLabel(minutes: number | null): string | null {
  if (minutes === null) return null
  return `${minutes}분 경과`
}

/**
 * staff/TableDetailPanel (89:8). A 420px inspector, not a full page: the
 * table grid has to stay in view so the next table is one tap away.
 *
 * The action hierarchy follows how often each is actually used — 서비스 제공
 * (constant, primary) → 이동/합석/분리/할인 (rare) → 메모/수정/취소. Only 주문
 * 취소 is danger, as an outline, and it is the one action behind a confirm
 * dialog. Payment confirmation happens on the 결제 station queue
 * (`/staff/payment`), not from this panel — the table-scoped 결제 확인 button
 * used to deep-link to a route that never existed and was removed.
 *
 * When a call is pending the banner pins to the very top of the header, above
 * the status control: what to carry over matters before what the order state
 * is.
 */
export function TableDetailPanel({
  detail,
  now,
  loading,
  statusPhase,
  statusError,
  onDismissStatusError,
  acknowledging,
  onClose,
  onAcknowledgeCall,
  onStatusChange,
  onServiceOrder,
  onMove,
  onMerge,
  onSplit,
  onDiscount,
  onNote,
  onEditOrder,
  onCancelOrder,
}: TableDetailPanelProps) {
  if (loading || !detail) {
    return (
      <aside className="detail-panel" aria-label="테이블 상세">
        <div className="detail-panel__placeholder">
          <StaffEmptyState
            title={loading ? '불러오는 중이에요' : '테이블을 선택하세요'}
            body={
              loading
                ? '테이블 상세를 가져오고 있습니다'
                : '왼쪽 그리드에서 테이블을 누르면 여기에 표시됩니다'
            }
          />
        </div>
      </aside>
    )
  }

  const { bill, call } = detail

  return (
    <aside className="detail-panel" aria-label={`${detail.displayName} 상세`}>
      <header className="detail-panel__header">
        {call && (
          <div className="detail-panel__call">
            <div className="detail-panel__call-info">
              <p className="detail-panel__call-title">
                {`직원 호출 ${call.count}회 · ${call.reasons.map(callReasonLabel).join(' · ')}`}
              </p>
              <p className="detail-panel__call-elapsed">
                {`${Math.max(0, Math.floor((now - Date.parse(call.firstCalledAt)) / 60_000))}분 전 첫 호출`}
              </p>
            </div>
            <OperationalButton
              size="md"
              loading={acknowledging}
              onClick={() => onAcknowledgeCall(detail.tableId)}
            >
              호출 확인
            </OperationalButton>
          </div>
        )}

        <div className="detail-panel__title-row">
          <h2 className="detail-panel__table">{detail.tableId}</h2>
          {detail.mergeLabel && (
            <span className="detail-panel__merge">{detail.mergeLabel}</span>
          )}
          {bill.discountRate > 0 && (
            <span className="detail-panel__discount">
              {`${bill.discountRate}% 할인`}
            </span>
          )}
          <button
            type="button"
            className="detail-panel__close"
            aria-label="상세 닫기"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="detail-panel__status-row">
          {detail.status && (
            <OrderStatusDropdown
              value={detail.status}
              phase={statusPhase}
              onChange={onStatusChange}
            />
          )}
          {elapsedLabel(detail.elapsedMinutes) && (
            <span className="detail-panel__elapsed">
              {elapsedLabel(detail.elapsedMinutes)}
            </span>
          )}
        </div>

        {statusError && (
          <StaffInlineAlert
            title="상태 변경에 실패했어요. 기존 상태는 유지됩니다."
            detail={statusError}
            actionLabel="닫기"
            onAction={onDismissStatusError}
          />
        )}

        <div className="detail-panel__money">
          <p className="detail-panel__money-row">
            <span>주문금액</span>
            <strong>{formatStaffAmount(bill.subtotalAmount)}</strong>
          </p>
          {bill.discountRate > 0 && (
            <p className="detail-panel__money-row detail-panel__money-row--discount">
              <span>{`${bill.discountRate}% 할인`}</span>
              <strong>{`-${formatStaffAmount(bill.discountAmount)}`}</strong>
            </p>
          )}
          <p className="detail-panel__final-row">
            <span>결제 금액</span>
            <strong>{formatStaffAmount(bill.finalAmount)}</strong>
          </p>
        </div>
      </header>

      <div className="detail-panel__orders">
        <ul className="detail-panel__order-list">
          {detail.items.map((item) => (
            <StaffOrderItem key={item.itemId} item={item} />
          ))}
        </ul>
        {detail.notes.length > 0 && (
          <div className="detail-panel__notes">
            {detail.notes.map((note) => (
              <OrderNote key={note.noteId} note={note} />
            ))}
          </div>
        )}
      </div>

      <footer className="detail-panel__actions">
        {/*
          A02 no longer places orders on the diner's behalf — guests order
          from their own phones, so the panel's lead action is the one thing
          staff can only do from here: comp a round.
          Reaching A10 costs nothing by itself; the grant is not written until
          a staff member is picked and the confirm dialog is read, so landing
          here by muscle memory is recoverable.
        */}
        <OperationalButton block onClick={onServiceOrder}>
          서비스 제공
        </OperationalButton>
        <div className="detail-panel__action-row">
          <OperationalButton variant="secondary" onClick={onMove}>
            이동
          </OperationalButton>
          <OperationalButton variant="secondary" onClick={onMerge}>
            합석
          </OperationalButton>
          <OperationalButton variant="secondary" onClick={onSplit}>
            분리
          </OperationalButton>
          <OperationalButton variant="secondary" onClick={onDiscount}>
            할인
          </OperationalButton>
        </div>
        <div className="detail-panel__action-row">
          <OperationalButton variant="secondary" onClick={onNote}>
            메모
          </OperationalButton>
          <OperationalButton variant="secondary" onClick={onEditOrder}>
            주문 수정
          </OperationalButton>
          <OperationalButton variant="danger" onClick={onCancelOrder}>
            주문 취소
          </OperationalButton>
        </div>
      </footer>
    </aside>
  )
}
