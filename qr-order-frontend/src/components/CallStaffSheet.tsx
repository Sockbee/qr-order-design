import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import { formatCallElapsed } from '../utils/call'
import { CALL_REASON_OPTIONS, callReasonLabel } from '../types/call'
import type { ActiveCall, CallReason } from '../types/call'
import type { StaffCallError, StaffCallPhase } from '../hooks/useStaffCall'

interface CallStaffSheetProps {
  tableNumber: number
  phase: StaffCallPhase
  activeCall: ActiveCall | null
  error: StaffCallError | null
  onCall: (reason: CallReason) => void
  onCancelCall: () => void
  onClose: () => void
  /** From `usePresence`. */
  closing?: boolean
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * S09 직원 호출 / S09b 호출 완료.
 *
 * One component, two views: which one shows is driven by whether this device
 * already has an unresolved call, not by a separate open flag. A diner who
 * reopens the sheet mid-wait must see "이미 불렀다", never a fresh form that
 * invites a duplicate call.
 *
 * Mounted only while open (plus one exit frame), so the reason selection
 * resets on each open without an effect to clear it.
 */
export function CallStaffSheet({
  tableNumber,
  phase,
  activeCall,
  error,
  onCall,
  onCancelCall,
  onClose,
  closing = false,
}: CallStaffSheetProps) {
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [selectedReason, setSelectedReason] = useState<CallReason | null>(null)

  useEffect(() => {
    if (closing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // Move focus into the sheet so keyboard and screen-reader users land here.
    sheetRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, closing])

  const called = activeCall !== null

  return (
    <div
      className={`fixed inset-0 z-10 flex flex-col justify-end items-center ${
        closing ? 'pointer-events-none' : ''
      }`}
      aria-hidden={closing || undefined}
    >
      <button
        type="button"
        className={`absolute inset-0 w-full h-full p-0 border-0 bg-scrim cursor-pointer motion-reduce:animate-none ${
          closing ? 'animate-fade-out' : 'animate-fade-in'
        }`}
        aria-label="닫기"
        onClick={onClose}
      />

      <div
        ref={sheetRef}
        className={`relative w-full max-w-[480px] flex flex-col gap-4 pt-3 px-4 pb-[calc(16px+var(--layout-safe-area))] rounded-t-[20px] bg-canvas focus:outline-none motion-reduce:animate-none ${
          closing ? 'animate-sheet-drop' : 'animate-sheet-rise'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="self-center w-9 h-1 rounded-full bg-border-strong" aria-hidden="true" />

        {called ? (
          <>
            <div
              className="self-center mt-2 flex items-center justify-center size-16 rounded-full bg-primary text-on-primary animate-pop-in-slow motion-reduce:animate-none"
              aria-hidden="true"
            >
              <CheckIcon size={30} />
            </div>
            <h2
              className="m-0 font-display font-normal text-[22px] leading-8 text-strong text-center self-center"
              id={titleId}
            >
              직원을 불렀어요
            </h2>
            <p className="-mt-2.5 mx-0 mb-0 text-sm leading-[21px] font-normal text-body text-center self-center">
              테이블 {tableNumber} · {callReasonLabel(activeCall.reason)}
              <br />
              잠시만 기다려 주세요
            </p>
            <p className="self-center m-0 py-1.5 px-2.5 rounded-[6px] bg-surface text-[12px] leading-[18px] text-body">
              {formatCallElapsed(activeCall.createdAt)}
            </p>

            {error && (
              <p
                className="m-0 py-2 px-3 rounded-btn-sm bg-[var(--color-status-attention-bg)] text-[var(--color-status-attention-fg)] font-bold text-sm leading-[21px]"
                role="status"
              >
                {error.message}
              </p>
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
            <h2
              className="m-0 font-display font-normal text-[22px] leading-8 text-strong"
              id={titleId}
            >
              직원을 부를까요?
            </h2>
            <p className="-mt-2.5 mx-0 mb-0 text-sm leading-[21px] font-normal text-body">
              테이블 {tableNumber} · 필요한 것을 선택하면 더 빨리 도와드릴 수 있어요
            </p>

            <div className="grid grid-cols-2 gap-2">
              {CALL_REASON_OPTIONS.map((option) => {
                const selected = selectedReason === option.reason
                return (
                  <button
                    key={option.reason}
                    type="button"
                    className={`flex items-center gap-2.5 min-h-[52px] rounded-row text-[15px] leading-[22px] text-left cursor-pointer transition-[background-color,border-color,color,transform] duration-150 ease-out-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                      selected
                        ? 'px-[11px] border-2 border-primary bg-selected text-link font-bold'
                        : 'px-3 border-[1.5px] border-border-strong bg-transparent text-strong font-normal active:bg-surface'
                    }`}
                    aria-pressed={selected}
                    onClick={() =>
                      setSelectedReason(selected ? null : option.reason)
                    }
                  >
                    <span
                      className={`flex-none flex items-center justify-center size-[22px] rounded-[6px] transition-colors duration-150 ease-out-soft motion-reduce:transition-none ${
                        selected
                          ? 'bg-primary text-canvas'
                          : 'border-[1.5px] border-border-control bg-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      {selected && <CheckIcon size={14} />}
                    </span>
                    <span className="min-w-0 truncate">{option.label}</span>
                  </button>
                )
              })}
            </div>

            {error && (
              <p
                className={`m-0 py-2 px-3 rounded-btn-sm font-bold text-sm leading-[21px] ${
                  error.throttled
                    ? 'bg-surface text-body'
                    : 'bg-[var(--color-status-attention-bg)] text-[var(--color-status-attention-fg)]'
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
