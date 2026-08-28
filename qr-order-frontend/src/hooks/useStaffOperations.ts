import { useCallback, useState } from 'react'
import { ApiClientError } from '../api/client'
import { hasStaffApi } from '../api/staff/client'
import {
  applyTableDiscount,
  confirmTablePayment,
  mergeTables,
  moveTable,
  splitTable,
} from '../api/staff/operations'

interface StaffOperationsState {
  submitting: boolean
  error: string | null
  clearError: () => void
  run: (operation: () => Promise<void>, onDone: () => void) => void
  move: (from: string, to: string, onDone: () => void) => void
  merge: (primary: string, secondary: string, onDone: () => void) => void
  split: (tableId: string, onDone: () => void) => void
  discount: (tableId: string, rate: number, onDone: () => void) => void
  confirmPayment: (
    tableId: string,
    expectedFinalAmount: number,
    onDone: () => void,
  ) => void
}

/**
 * The rare, hard-to-undo table operations. Each one is fire-and-navigate:
 * the dialog closes on success and the grid's next poll shows the result, so
 * there is no half-applied state to reconcile locally.
 */
export function useStaffOperations(): StaffOperationsState {
  const configured = hasStaffApi()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    (operation: () => Promise<void>, onDone: () => void) => {
      if (!configured) {
        // No deployment to talk to — close the dialog and leave the seed as is.
        onDone()
        return
      }
      setSubmitting(true)
      setError(null)
      void operation()
        .then(onDone)
        .catch((caught: unknown) => {
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : '운영 서버에 연결할 수 없습니다.',
          )
        })
        .finally(() => setSubmitting(false))
    },
    [configured],
  )

  return {
    submitting,
    error,
    clearError: useCallback(() => setError(null), []),
    run,
    move: useCallback(
      (from, to, onDone) => run(() => moveTable(from, to), onDone),
      [run],
    ),
    merge: useCallback(
      (primary, secondary, onDone) =>
        run(() => mergeTables(primary, secondary), onDone),
      [run],
    ),
    split: useCallback(
      (tableId, onDone) => run(() => splitTable(tableId), onDone),
      [run],
    ),
    discount: useCallback(
      (tableId, rate, onDone) =>
        run(() => applyTableDiscount(tableId, rate), onDone),
      [run],
    ),
    confirmPayment: useCallback(
      (tableId, expectedFinalAmount, onDone) =>
        run(() => confirmTablePayment(tableId, expectedFinalAmount), onDone),
      [run],
    ),
  }
}
