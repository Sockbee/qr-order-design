import { callStaffApi } from './client'
import type { CallReason } from '../../types/call'
import type {
  StaffBill,
  StaffNoteAudience,
  StaffOrderStatus,
  StaffTableDetail,
} from '../../types/staff'

/**
 * A02 needs one table's bill *and* its order lines, notes and pending call.
 * apps-script-api-design.md has `tables/bill` (§4.12) for the money only, so
 * `tables/detail` is specified here from what the panel draws (89:8) and is
 * still to be implemented server-side. See the PR document.
 */
export interface StaffTableDetailResponse {
  tableId: string
  displayName: string
  orderStatus: string | null
  openedAt: string | null
  mergedTableIds: string[]
  originTableId: string | null
  /** Same shape as the §4.12 bill so one implementation can serve both. */
  subtotalAmount: number
  discountRate: number
  discountAmount: number
  finalAmount: number
  paymentStatus: 'UNPAID' | 'PAID' | null
  items: Array<{
    itemId: string
    name: string
    selectedOptions: string[]
    quantity: number
    lineTotal: number
    status: string
    note: string | null
  }>
  notes: Array<{
    noteId: string
    audience: StaffNoteAudience
    text: string
  }>
  call: {
    count: number
    reasons: CallReason[]
    firstCalledAt: string
    lastCalledAt: string
    callIds: string[]
  } | null
}

export function getStaffTableDetail(
  tableId: string,
  signal?: AbortSignal,
): Promise<StaffTableDetailResponse> {
  return callStaffApi<StaffTableDetailResponse>(
    'tables/detail',
    { tableId },
    signal,
  )
}

function mapStatus(orderStatus: string | null): StaffOrderStatus | null {
  switch (orderStatus) {
    case 'RECEIVED':
      return 'new'
    case 'COOKING':
      return 'cooking'
    case 'READY':
      return 'ready'
    case 'SERVED':
      return 'served'
    default:
      return null
  }
}

function mapBill(response: StaffTableDetailResponse): StaffBill {
  return {
    subtotalAmount: response.subtotalAmount,
    discountRate: response.discountRate,
    discountAmount: response.discountAmount,
    finalAmount: response.finalAmount,
    paid: response.paymentStatus === 'PAID',
  }
}

export function mapStaffTableDetail(
  response: StaffTableDetailResponse,
  now: number = Date.now(),
): StaffTableDetail {
  const opened = response.openedAt ? Date.parse(response.openedAt) : NaN
  return {
    tableId: response.tableId,
    displayName: response.displayName,
    status: mapStatus(response.orderStatus),
    elapsedMinutes: Number.isNaN(opened)
      ? null
      : Math.max(0, Math.floor((now - opened) / 60_000)),
    bill: mapBill(response),
    items: response.items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      // A02 draws an em dash rather than an empty row when there is no option.
      optionSummary:
        item.selectedOptions.length > 0 ? item.selectedOptions.join(' · ') : '—',
      quantity: item.quantity,
      amount: item.lineTotal,
      cancelled: item.status === 'CANCELLED',
      note: item.note,
    })),
    notes: response.notes,
    call: response.call
      ? {
          tableId: response.tableId,
          displayName: response.displayName,
          count: response.call.count,
          reasons: response.call.reasons,
          firstCalledAt: response.call.firstCalledAt,
          lastCalledAt: response.call.lastCalledAt,
          callIds: response.call.callIds,
        }
      : null,
    mergeLabel:
      response.mergedTableIds.length > 0 && response.originTableId
        ? `${[response.originTableId, ...response.mergedTableIds].join('+')} 합석`
        : null,
  }
}

/**
 * The status dropdown is the most-used control in the app. There is no
 * documented action for it either — `orders/status` is specified here.
 *
 * Sequential transitions are deliberately not enforced: 조리 중 → 서빙 완료 is
 * a correction an operator has to be able to make in one move (83:47).
 */
const STATUS_TO_REMOTE: Record<StaffOrderStatus, string> = {
  new: 'RECEIVED',
  cooking: 'COOKING',
  ready: 'READY',
  served: 'SERVED',
  unpaid: 'UNPAID',
  paid: 'PAID',
}

export function updateStaffOrderStatus(
  tableId: string,
  status: StaffOrderStatus,
  signal?: AbortSignal,
): Promise<void> {
  return callStaffApi<void>(
    'orders/status',
    { tableId, status: STATUS_TO_REMOTE[status] },
    signal,
  )
}
