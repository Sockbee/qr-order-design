import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './StaffDialog.css'
import { OperationalButton } from './OperationalButton'

interface StaffDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  /** Danger confirms are outlined, never filled red (DESIGN.md §7). */
  confirmVariant?: 'primary' | 'danger'
  confirmDisabled?: boolean
  submitting?: boolean
  /** `wide` is the 680px operation dialog; `narrow` the 480px confirm. */
  size?: 'wide' | 'narrow'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The 680px operation dialog shared by A04–A07 (93:852, 95:1103, 95:1260,
 * 95:1418). Scrim plus a card — no shadow, since separation is scrim and
 * whitespace only (DESIGN.md §6).
 *
 * Every one of these dialogs states its consequence before the confirm
 * button, so the operator reads what will happen rather than guessing from
 * the verb.
 */
export function StaffDialog({
  title,
  children,
  confirmLabel,
  confirmVariant = 'primary',
  confirmDisabled = false,
  submitting = false,
  size = 'wide',
  onConfirm,
  onCancel,
}: StaffDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  useEffect(() => {
    cardRef.current?.focus()
  }, [])

  return (
    <div className="staff-dialog" role="presentation" onClick={onCancel}>
      <div
        ref={cardRef}
        className={`staff-dialog__card staff-dialog__card--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="staff-dialog__title">{title}</h2>
        {children}
        <div className="staff-dialog__actions">
          <OperationalButton variant="secondary" onClick={onCancel}>
            취소
          </OperationalButton>
          <OperationalButton
            variant={confirmVariant === 'danger' ? 'danger' : 'primary'}
            disabled={confirmDisabled}
            loading={submitting}
            onClick={onConfirm}
          >
            {confirmLabel}
          </OperationalButton>
        </div>
      </div>
    </div>
  )
}

/**
 * The blue "이렇게 됩니다" box every operation dialog carries. The point is
 * that a rare, hard-to-undo action is described in full before it is taken.
 */
export function ImpactNote({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="staff-dialog__impact">
      <p className="staff-dialog__impact-title">{title}</p>
      <p className="staff-dialog__impact-body">{children}</p>
    </div>
  )
}

/**
 * staff/ConfirmDialog (99:1591). Destructive actions state their consequence
 * concretely — how many orders and how much money — rather than asking a
 * generic "are you sure?".
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  submitting = false,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <StaffDialog
      title={title}
      size="narrow"
      confirmLabel={confirmLabel}
      confirmVariant="danger"
      submitting={submitting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="staff-dialog__body">{body}</p>
    </StaffDialog>
  )
}

/** The grey summary box (현재 테이블 / 합친 결과 / 현재 합석). */
export function DialogSummary({
  label,
  table,
  meta,
  size = 'lg',
}: {
  label: string
  table: string
  meta: string
  /** `lg` uses the 32px table number, `md` the 22px one. */
  size?: 'lg' | 'md'
}) {
  return (
    <div className="staff-dialog__summary">
      <p className="staff-dialog__summary-label">{label}</p>
      <div className="staff-dialog__summary-row">
        <p className={`staff-dialog__summary-table staff-dialog__summary-table--${size}`}>
          {table}
        </p>
        <p className="staff-dialog__summary-meta">{meta}</p>
      </div>
    </div>
  )
}
