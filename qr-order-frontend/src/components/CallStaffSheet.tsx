import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import { formatCallElapsed } from '../utils/call'
import { CALL_REASON_OPTIONS, callReasonLabel } from '../types/call'
import type { ActiveCall, CallReason } from '../types/call'
import type { StaffCallError, StaffCallPhase } from '../hooks/useStaffCall'
import './CallStaffSheet.css'

interface CallStaffSheetProps {
  tableNumber: number
  phase: StaffCallPhase
  activeCall: ActiveCall | null
  error: StaffCallError | null
  onCall: (reason: CallReason) => void
  onCancelCall: () => void
  onClose: () => void
}

/**
 * S09 직원 호출 / S09b 호출 완료.
 *
 * One component, two views: which one shows is driven by whether this device
 * already has an unresolved call, not by a separate open flag. A diner who
 * reopens the sheet mid-wait must see "이미 불렀다", never a fresh form that
 * invites a duplicate call.
 *
 * Mounted only while open, so the reason selection resets on each open
 * without an effect to clear it.
 */
export function CallStaffSheet({
  tableNumber,
  phase,
  activeCall,
  error,
  onCall,
  onCancelCall,
  onClose,
}: CallStaffSheetProps) {
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [selectedReason, setSelectedReason] = useState<CallReason | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // Move focus into the sheet so keyboard and screen-reader users land here.
    sheetRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const called = activeCall !== null

  return (
    <div className="call-sheet">
      <button
        type="button"
        className="call-sheet__scrim"
        aria-label="닫기"
        onClick={onClose}
      />

      <div
        ref={sheetRef}
        className="call-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {called ? (
          <>
            <div className="call-sheet__mark" aria-hidden="true">✓</div>
            <h2 className="call-sheet__title" id={titleId}>직원을 불렀어요</h2>
            <p className="call-sheet__body">
              테이블 {tableNumber} · {callReasonLabel(activeCall.reason)}
              <br />
              잠시만 기다려 주세요
            </p>
            <p className="call-sheet__elapsed">
              {formatCallElapsed(activeCall.createdAt)}
            </p>

            {error && (
              <p className="call-sheet__error" role="status">{error.message}</p>
            )}

            <Button block size="xlarge" variant="fill" label="확인" onClick={onClose} />
            <Button
              block
              size="large"
              variant="weak"
              label="호출 취소"
              loading={phase === 'cancelling'}
              onClick={onCancelCall}
            />
          </>
        ) : (
          <>
            <h2 className="call-sheet__title" id={titleId}>직원을 부를까요?</h2>
            <p className="call-sheet__body">
              테이블 {tableNumber} · 필요한 것을 선택하면 더 빨리 도와드릴 수 있어요
            </p>

            <div className="call-sheet__reasons">
              {CALL_REASON_OPTIONS.map((option) => {
                const selected = selectedReason === option.reason
                return (
                  <button
                    key={option.reason}
                    type="button"
                    className={`call-sheet__reason${
                      selected ? ' call-sheet__reason--selected' : ''
                    }`}
                    aria-pressed={selected}
                    onClick={() =>
                      setSelectedReason(selected ? null : option.reason)
                    }
                  >
                    <span className="call-sheet__check" aria-hidden="true" />
                    <span className="call-sheet__reason-label">{option.label}</span>
                  </button>
                )
              })}
            </div>

            {error && (
              <p
                className={`call-sheet__error${
                  error.throttled ? ' call-sheet__error--calm' : ''
                }`}
                role="alert"
              >
                {error.message}
              </p>
            )}

            <Button
              block
              size="xlarge"
              variant="fill"
              label="직원 호출"
              loading={phase === 'submitting'}
              onClick={() => onCall(selectedReason ?? 'OTHER')}
            />
            <Button block size="large" variant="weak" label="취소" onClick={onClose} />
          </>
        )}
      </div>
    </div>
  )
}
