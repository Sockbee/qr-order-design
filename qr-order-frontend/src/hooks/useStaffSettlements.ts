import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiClientError } from '../api/client'
import { hasStaffApi, isStaffAuthError } from '../api/staff/client'
import {
  confirmStaffSettlement,
  listStaffSettlements,
  mapStaffSettlements,
  STAFF_DISCOUNT_RATE,
} from '../api/staff/service'
import { staffSettlements as fallbackSettlements } from '../data/staff'
import type { StaffSettlement } from '../types/staff'

interface StaffSettlementsState {
  members: StaffSettlement[]
  discountRate: number
  totalChargeAmount: number
  loading: boolean
  error: ApiClientError | null
  unauthorized: boolean
  busyId: string | null
  retry: () => void
  clearError: () => void
  confirm: (
    staffId: string,
    expectedChargeAmount: number,
    onDone: () => void,
  ) => void
}

function toApiError(caught: unknown): ApiClientError {
  if (caught instanceof ApiClientError) return caught
  return new ApiClientError(
    'NETWORK_ERROR',
    '운영 서버에 연결할 수 없습니다.',
    true,
  )
}

/**
 * §4.21/§4.22. Settlement is an end-of-event reconciliation, not a live
 * queue, so this is fetched on mount and after each confirm rather than
 * polled — nothing changes it but the treasurer standing at this screen.
 *
 * `includeSettled` is always true here: the screen shows 미정산 and 정산 완료
 * as two sections, and the completed one is how the treasurer checks their
 * own work.
 */
export function useStaffSettlements(): StaffSettlementsState {
  const configured = hasStaffApi()
  const [remote, setRemote] = useState<{
    members: StaffSettlement[]
    discountRate: number
    totalChargeAmount: number
  } | null>(null)
  const [error, setError] = useState<ApiClientError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Confirmed locally so the card moves sections before the refetch lands. */
  const [confirmed, setConfirmed] = useState<string[]>([])

  useEffect(() => {
    if (!configured) return
    let disposed = false
    const controller = new AbortController()
    listStaffSettlements(true, controller.signal)
      .then((response) => {
        if (disposed) return
        setRemote({
          members: mapStaffSettlements(response),
          discountRate: response.staffDiscountRate,
          totalChargeAmount: response.totalChargeAmount,
        })
        setConfirmed([])
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!disposed && !controller.signal.aborted) {
          setError(toApiError(caught))
        }
      })
    return () => {
      disposed = true
      controller.abort()
    }
  }, [attempt, configured])

  const fallback = useMemo(() => {
    const members = fallbackSettlements()
    return {
      members,
      discountRate: STAFF_DISCOUNT_RATE,
      totalChargeAmount: members
        .filter((member) => !member.settled)
        .reduce((sum, member) => sum + member.chargeAmount, 0),
    }
  }, [])

  const base = remote ?? (configured ? null : fallback)

  const confirm = useCallback(
    (staffId: string, expectedChargeAmount: number, onDone: () => void) => {
      const resolve = () => {
        setConfirmed((current) => [...current, staffId])
        onDone()
      }
      if (!configured) {
        resolve()
        return
      }
      setBusyId(staffId)
      void confirmStaffSettlement(staffId, expectedChargeAmount)
        .then(() => {
          resolve()
          setAttempt((value) => value + 1)
        })
        .catch((caught: unknown) => setError(toApiError(caught)))
        .finally(() => setBusyId(null))
    },
    [configured],
  )

  const members = useMemo(() => {
    if (!base) return []
    return base.members.map((member) =>
      confirmed.includes(member.staffId)
        ? {
            ...member,
            settled: true,
            settledAmount: member.chargeAmount,
            settledAt: new Date().toISOString(),
          }
        : member,
    )
  }, [base, confirmed])

  return {
    members,
    discountRate: base?.discountRate ?? STAFF_DISCOUNT_RATE,
    totalChargeAmount: members
      .filter((member) => !member.settled)
      .reduce((sum, member) => sum + member.chargeAmount, 0),
    loading: configured && remote === null && error === null,
    error,
    unauthorized: isStaffAuthError(error),
    busyId,
    retry: useCallback(() => {
      setError(null)
      setAttempt((value) => value + 1)
    }, []),
    clearError: useCallback(() => setError(null), []),
    confirm,
  }
}
