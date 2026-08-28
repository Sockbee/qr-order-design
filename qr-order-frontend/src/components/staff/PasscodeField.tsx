import { useId, useState } from 'react'
import './PasscodeField.css'

interface PasscodeFieldProps {
  value: string
  invalid?: boolean
  disabled?: boolean
  onChange: (value: string) => void
  onSubmit?: () => void
}

/**
 * A09 (113:1810). Masked by default with a 보기 toggle — the passcode is a
 * long phrase typed on a tablet keyboard, so being unable to check it is a
 * worse risk than briefly showing it behind the counter.
 *
 * The field never echoes the passcode anywhere else: no logging, no storage,
 * no error message repeating it back (§4.9).
 */
export function PasscodeField({
  value,
  invalid = false,
  disabled = false,
  onChange,
  onSubmit,
}: PasscodeFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const inputId = useId()

  return (
    <div
      className={`passcode-field${invalid ? ' passcode-field--invalid' : ''}${
        disabled ? ' passcode-field--disabled' : ''
      }`}
    >
      <input
        id={inputId}
        className="passcode-field__input"
        type={revealed ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        autoComplete="off"
        aria-label="passcode"
        aria-invalid={invalid || undefined}
        placeholder="passcode 입력"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.()
        }}
      />
      <button
        type="button"
        className="passcode-field__toggle"
        disabled={disabled}
        aria-pressed={revealed}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? '숨기기' : '보기'}
      </button>
    </div>
  )
}
