import { callAppsScript } from './client'
import type { ActiveCall, CallReason } from '../types/call'
import type { TableCredentials } from '../types/session'

interface CreateCallResponse {
  callId: string
  tableId: string
  reason: CallReason
  status: 'PENDING'
  createdAt: string
  idempotentReplay: boolean
}

/**
 * `clientRequestId` makes a retried call idempotent: resending the same id
 * returns the existing call instead of adding a second row to the table's
 * pending group (apps-script-api-design.md §4.7).
 */
export async function createCall(
  credentials: TableCredentials,
  reason: CallReason,
  clientRequestId: string,
  signal?: AbortSignal,
): Promise<ActiveCall> {
  const data = await callAppsScript<CreateCallResponse>(
    'calls/create',
    {
      tableId: credentials.tableId,
      tableToken: credentials.tableToken,
      reason,
      clientRequestId,
    },
    signal,
  )
  return {
    callId: data.callId,
    reason: data.reason,
    createdAt: data.createdAt,
  }
}

/**
 * Only a PENDING call can be cancelled. Once staff acknowledges it they may
 * already be walking over, so the server refuses with CALL_ALREADY_RESOLVED.
 */
export function cancelCall(
  credentials: TableCredentials,
  callId: string,
  signal?: AbortSignal,
): Promise<void> {
  return callAppsScript<void>(
    'calls/cancel',
    {
      tableId: credentials.tableId,
      tableToken: credentials.tableToken,
      callId,
    },
    signal,
  )
}
