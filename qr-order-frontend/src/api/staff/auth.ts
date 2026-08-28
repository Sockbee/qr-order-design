import { callStaffApi } from './client'
import type { StaffSession, StaffStation } from './client'

/**
 * apps-script-api-design.md §4.9. The passcode is shared by the whole team,
 * not per device — what the audit log records is the station chosen here.
 * It is never echoed back, logged, or stored.
 */
interface StaffLoginResponse {
  staffToken: string
  deviceLabel: StaffStation
  expiresAt: string
}

export function staffLogin(
  deviceLabel: StaffStation,
  passcode: string,
  signal?: AbortSignal,
): Promise<StaffSession> {
  return callStaffApi<StaffLoginResponse>(
    'staff/login',
    { deviceLabel, passcode },
    signal,
    { anonymous: true },
  )
}
