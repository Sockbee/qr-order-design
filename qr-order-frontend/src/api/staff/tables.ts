import { callStaffApi } from './client'
import type {
  StaffOrderStatus,
  StaffTableHomeData,
  StaffTableSummary,
} from '../../types/staff'
import type { CallReason } from '../../types/call'
import type { StaffCallGroup } from '../../types/staff'

/**
 * A01 needs the whole floor in one snapshot. apps-script-api-design.md has no
 * such action yet — §4.12 `tables/bill` is one table's billing, not the grid —
 * so `tables/list` is specified here from what A01 (90:2) actually draws and
 * still has to be implemented on the Apps Script side. See the PR document.
 */
export interface StaffTableListItem {
  tableId: string
  displayName: string
  sessionStatus: 'OPEN' | 'CLOSED' | 'EMPTY'
  orderStatus: string | null
  paymentStatus: string | null
  totalAmount: number
  openedAt: string | null
  pendingItemCount: number
  hasPendingCall: boolean
  mergeGroupLabel: string | null
  discountLabel: string | null
}

export interface StaffTableListResponse {
  tables: StaffTableListItem[]
  serverTime: string
}

export function listStaffTables(
  signal?: AbortSignal,
): Promise<StaffTableListResponse> {
  return callStaffApi<StaffTableListResponse>('tables/list', {}, signal)
}

/**
 * The badge carries the *order* step only. A01 draws T12 as 조리 중 with
 * "결제 완료" in the meta line, so payment never replaces the badge — the
 * unpaid/paid steps belong to the payment screen (B03).
 */
function mapStatus(item: StaffTableListItem): StaffOrderStatus | null {
  switch (item.orderStatus) {
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

function elapsedMinutes(openedAt: string | null, now: number): number | null {
  if (!openedAt) return null
  const opened = Date.parse(openedAt)
  if (Number.isNaN(opened)) return null
  return Math.max(0, Math.floor((now - opened) / 60_000))
}

export function mapStaffTables(
  response: StaffTableListResponse,
  now: number = Date.now(),
): StaffTableSummary[] {
  return response.tables.map((item) => {
    const occupied = item.sessionStatus === 'OPEN'
    return {
      tableId: item.tableId,
      displayName: item.displayName,
      occupied,
      status: occupied ? mapStatus(item) : null,
      amount: occupied ? item.totalAmount : 0,
      elapsedMinutes: occupied ? elapsedMinutes(item.openedAt, now) : null,
      pendingItemCount: occupied ? item.pendingItemCount : 0,
      paid: item.paymentStatus === 'PAID',
      hasCall: item.hasPendingCall,
      mergeLabel: occupied ? item.mergeGroupLabel : null,
      discountLabel: occupied ? item.discountLabel : null,
    }
  })
}

/** Warning amber at 24분, delayed red at 35분 — see the PR document. */
export const ELAPSED_WARNING_MINUTES = 24
export const ELAPSED_DELAYED_MINUTES = 35

export function isDelayed(table: StaffTableSummary): boolean {
  return (
    table.occupied &&
    !table.paid &&
    (table.elapsedMinutes ?? 0) >= ELAPSED_DELAYED_MINUTES
  )
}

/**
 * The header and the rail badge both count *tables*, not calls
 * (staff/CallRow, 106:124), so the counts are derived here once.
 */
export function buildTableHomeData(
  tables: StaffTableSummary[],
  callGroups: StaffCallGroup[],
): StaffTableHomeData {
  const pending = callGroups.filter((group) => !group.acknowledged)
  return {
    tables,
    callGroups,
    callingTableCount: pending.length,
    activeTableCount: tables.filter((table) => table.occupied).length,
    pendingItemCount: tables.reduce(
      (total, table) => total + table.pendingItemCount,
      0,
    ),
    delayedTableCount: tables.filter(isDelayed).length,
  }
}

export type { CallReason }
