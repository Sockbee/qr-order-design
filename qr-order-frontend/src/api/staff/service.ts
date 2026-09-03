import { callStaffApi } from './client'
import type {
  StaffMember,
  StaffSettlement,
  StaffServiceCharge,
} from '../../types/staff'

/**
 * Service grants and staff settlement — apps-script-api-design §4.20–§4.22.
 *
 * Unlike `menu/list` and `orders/queue`, every action here is specified in
 * that document, so the transport names below are the contract rather than
 * this frontend's invention.
 */

/** Settings `STAFF_DISCOUNT_RATE`. Mirrored locally for the mock path only. */
export const STAFF_DISCOUNT_RATE = 20

/**
 * Schema §9. §15 floors the *discount* and subtracts it, so this does too —
 * flooring the charge directly disagrees with the table discount by up to a
 * won (1001 at 20% gives 800 that way, 801 this way).
 *
 * One floor on the order total, never per line: N line-level floors drift
 * from the true figure by as much as N-1 won.
 */
export function staffServiceCharge(
  grossAmount: number,
  discountRate: number = STAFF_DISCOUNT_RATE,
): StaffServiceCharge {
  const discountAmount = Math.floor((grossAmount * discountRate) / 100)
  return {
    grossAmount,
    discountRate,
    chargeAmount: grossAmount - discountAmount,
  }
}

export interface StaffMemberListResponse {
  members: Array<{
    staffId: string
    name: string
    affiliation: string | null
    active: boolean
  }>
}

export function listStaffMembers(
  signal?: AbortSignal,
): Promise<StaffMemberListResponse> {
  return callStaffApi<StaffMemberListResponse>('members/list', {}, signal)
}

export function mapStaffMembers(
  response: StaffMemberListResponse,
): StaffMember[] {
  return response.members.map((member) => ({
    staffId: member.staffId,
    name: member.name,
    affiliation: member.affiliation,
    active: member.active,
  }))
}

export interface StaffServiceOrderLine {
  menuId: string
  quantity: number
  selectedOptionIds?: string[]
}

export interface StaffServiceOrderResponse {
  orderId: string
  displayCode: string
  orderKind: 'SERVICE'
  totalAmount: number
  serviceGrossAmount: number
  staffDiscountRate: number
  staffChargeAmount: number
  chargedStaff: { staffId: string; name: string }
  serviceMessage: string | null
}

/** §4.20 caps the customer-facing message at 100 characters. */
export const SERVICE_MESSAGE_MAX_LENGTH = 100

/**
 * §4.20. `totalAmount` always comes back 0 — the guest is not billed, and no
 * amount may be sent up (the §4.4 forbidden-field rule applies unchanged).
 * The approver is deliberately absent: grants only happen on the treasurer's
 * iPad, so it is a constant and constants are not stored.
 *
 * `serviceMessage` is written *to the diner* and rendered on their device —
 * it is not an internal reason note. The field is named for its audience so
 * nobody later treats it as a staff memo and leaks it into a kitchen ticket.
 */
export function createServiceOrder(
  tableId: string,
  chargedStaffId: string,
  serviceMessage: string | null,
  lines: StaffServiceOrderLine[],
  signal?: AbortSignal,
): Promise<StaffServiceOrderResponse> {
  return callStaffApi<StaffServiceOrderResponse>(
    'orders/service',
    { tableId, chargedStaffId, serviceMessage, items: lines },
    signal,
  )
}

export interface StaffSettlementListResponse {
  staffDiscountRate: number
  members: Array<{
    staffId: string
    name: string
    affiliation: string | null
    serviceOrderCount: number
    grossAmount: number
    chargeAmount: number
    settlementStatus: 'UNSETTLED' | 'SETTLED'
    settledAmount: number | null
    settledAt: string | null
    orders: Array<{
      orderId: string
      displayCode: string
      tableId: string
      serviceMessage: string | null
      grossAmount: number
      chargeAmount: number
      createdAt: string
    }>
  }>
  totalChargeAmount: number
  unsettledStaffCount: number
}

/** §4.21. `includeSettled` false hides everyone already collected from. */
export function listStaffSettlements(
  includeSettled: boolean,
  signal?: AbortSignal,
): Promise<StaffSettlementListResponse> {
  return callStaffApi<StaffSettlementListResponse>(
    'settlements/list',
    { includeSettled },
    signal,
  )
}

export function mapStaffSettlements(
  response: StaffSettlementListResponse,
): StaffSettlement[] {
  return response.members.map((member) => ({
    staffId: member.staffId,
    name: member.name,
    affiliation: member.affiliation,
    serviceOrderCount: member.serviceOrderCount,
    grossAmount: member.grossAmount,
    chargeAmount: member.chargeAmount,
    settled: member.settlementStatus === 'SETTLED',
    settledAmount: member.settledAmount,
    settledAt: member.settledAt,
    orders: member.orders.map((order) => ({ ...order })),
  }))
}

/**
 * §4.22. `expectedChargeAmount` is required for the same reason
 * `expectedFinalAmount` is on `tables/confirm-payment`: the operator must
 * never confirm a figure they have not seen. A mismatch is
 * `SETTLEMENT_AMOUNT_CHANGED`, and a second confirm is
 * `SETTLEMENT_ALREADY_SETTLED` rather than an idempotent success — collecting
 * twice is the failure this guards.
 */
export function confirmStaffSettlement(
  staffId: string,
  expectedChargeAmount: number,
  signal?: AbortSignal,
): Promise<{ staffId: string; settledAmount: number; settledAt: string }> {
  return callStaffApi<{
    staffId: string
    settledAmount: number
    settledAt: string
  }>('settlements/confirm', { staffId, expectedChargeAmount }, signal)
}
