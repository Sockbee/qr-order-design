import { useEffect, useId, useRef } from 'react'
import { Button } from './Button'

interface DialogProps {
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** From `usePresence`. */
  closing?: boolean
}

/**
 * `ext/Dialog` (UX-STRUCTURE §4.2: centered, r16, 2 buttons). No Figma frame
 * exists yet for D1–D3, so this is built from the spec table, not a frame —
 * see CLAUDE.md.
 */
export function Dialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  closing = false,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  // Ref, not a dependency: an inline `onCancel` would refocus the panel on every parent render.
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  })

  useEffect(() => {
    if (closing) {
      const active = document.activeElement
      if (active instanceof HTMLElement && panelRef.current?.contains(active)) active.blur()
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closing])

  return (
    <div
      className={`fixed inset-0 z-10 flex items-center justify-center p-4 ${
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
        onClick={onCancel}
      />

      <div
        ref={panelRef}
        className={`relative w-full max-w-[320px] flex flex-col gap-1.5 p-5 rounded-btn-xl bg-canvas focus:outline-none motion-reduce:animate-none ${
          closing ? 'animate-dialog-out' : 'animate-dialog-in'
        }`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2
          className="m-0 font-display font-normal text-xl leading-7 text-strong break-keep"
          id={titleId}
        >
          {title}
        </h2>
        {description && (
          <p className="m-0 text-sm leading-[21px] font-normal text-body">
            {description}
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <Button
            className="flex-1"
            size="large"
            variant="weak"
            label={cancelLabel}
            onClick={onCancel}
          />
          <Button
            className="flex-1"
            size="large"
            variant="fill"
            label={confirmLabel}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  )
}
