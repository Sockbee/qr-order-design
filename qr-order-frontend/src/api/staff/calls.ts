import { callStaffApi } from './client'
import type { CallReason } from '../../types/call'
import type { StaffCallGroup } from '../../types/staff'

/** apps-script-api-design.md §4.10 — merged, never the raw Calls rows. */
export interface StaffCallGroupResponse {
  tableId: string
  displayName: string
  count: number
  reasons: CallReason[]
  firstCalledAt: string
  lastCalledAt: string
  callIds: string[]
}

export interface StaffCallListResponse {
  groups: StaffCallGroupResponse[]
  tableCount: number
}

export function listStaffCalls(
  signal?: AbortSignal,
): Promise<StaffCallListResponse> {
  return callStaffApi<StaffCallListResponse>('calls/list', {}, signal)
}

/**
 * §4.11 takes a `tableId`, not a `callId`: acknowledging is a group action
 * over that table's PENDING rows. Two staff pressing at once is not an error —
 * the second call simply reports `acknowledgedCount: 0`.
 */
export interface StaffAcknowledgeResponse {
  tableId: string
  acknowledgedCount: number
  acknowledgedAt: string
}

export function acknowledgeStaffCall(
  tableId: string,
  signal?: AbortSignal,
): Promise<StaffAcknowledgeResponse> {
  return callStaffApi<StaffAcknowledgeResponse>(
    'calls/acknowledge',
    { tableId },
    signal,
  )
}

export function mapStaffCallGroups(
  response: StaffCallListResponse,
): StaffCallGroup[] {
  return response.groups
    .slice()
    .sort((a, b) => Date.parse(a.firstCalledAt) - Date.parse(b.firstCalledAt))
    .map((group) => ({
      tableId: group.tableId,
      displayName: group.displayName,
      count: group.count,
      reasons: group.reasons,
      firstCalledAt: group.firstCalledAt,
      lastCalledAt: group.lastCalledAt,
      callIds: group.callIds,
    }))
}
