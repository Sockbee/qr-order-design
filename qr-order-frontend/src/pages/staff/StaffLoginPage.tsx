import { useEffect, useState } from 'react'
import './StaffLoginPage.css'
import { OperationalButton } from '../../components/staff/OperationalButton'
import { PasscodeField } from '../../components/staff/PasscodeField'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import { StationPicker } from '../../components/staff/StationPicker'
import type { StaffStation } from '../../api/staff/client'
import type { StaffAuthError } from '../../hooks/useStaffAuth'

interface StaffLoginPageProps {
  submitting: boolean
  error: StaffAuthError | null
  /** True when the operator was signed in and the 14-hour session ran out. */
  expired: boolean
  onSubmit: (station: StaffStation, passcode: string) => void
  onDismissError: () => void
}

function remainingLabel(throttledUntil: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((throttledUntil - now) / 60_000))
  return `${minutes}분 후 다시 시도`
}

/**
 * A09 — Staff Login (113:1795). One card, centred: choose the station this
 * device is acting as, then enter the shared passcode.
 *
 * A failed attempt says what was wrong without echoing the passcode back, and
 * the station choice survives — there is no reason to make anyone pick it
 * twice (114:1799).
 */
export function StaffLoginPage({
  submitting,
  error,
  expired,
  onSubmit,
  onDismissError,
}: StaffLoginPageProps) {
  const [station, setStation] = useState<StaffStation | null>(null)
  const [passcode, setPasscode] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const throttledUntil = error?.throttledUntil ?? null
  const throttled = throttledUntil !== null && throttledUntil > now

  useEffect(() => {
    if (throttledUntil === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [throttledUntil])

  const locked = submitting || throttled
  const canSubmit = station !== null && passcode.length > 0 && !locked

  const submit = () => {
    if (!canSubmit || station === null) return
    onSubmit(station, passcode)
    // Never keep the passcode around once it has been sent.
    setPasscode('')
  }

  return (
    <div className="staff-login" data-staff-app>
      <div className="staff-login__card">
        <h1 className="staff-login__title">운영 기기 인증</h1>
        <p className="staff-login__lead">
          이 기기를 어느 스테이션으로 쓸지 고르고 passcode를 입력하세요. 인증은
          14시간 유지됩니다.
        </p>

        {expired && !error && (
          <StaffInlineAlert
            tone="info"
            title="인증이 만료되었어요"
            detail="진행 중이던 작업은 서버에 저장되어 있습니다. 다시 인증하면 그대로 이어집니다."
          />
        )}

        {error && (
          <StaffInlineAlert
            tone={error.tone}
            title={error.title}
            detail={
              throttled && throttledUntil !== null
                ? `${error.detail} (${remainingLabel(throttledUntil, now)})`
                : error.detail
            }
          />
        )}

        <p className="staff-login__label">스테이션</p>
        <StationPicker
          value={station}
          disabled={submitting}
          onChange={(next) => {
            setStation(next)
            onDismissError()
          }}
        />

        <p className="staff-login__label">passcode</p>
        <PasscodeField
          value={passcode}
          invalid={Boolean(error) && !throttled}
          disabled={locked}
          onChange={setPasscode}
          onSubmit={submit}
        />
        <p className="staff-login__hint">
          12자 이상 문구를 사용합니다. 숫자 4자리는 사용하지 않습니다.
        </p>

        <OperationalButton
          block
          loading={submitting}
          disabled={!canSubmit}
          onClick={submit}
        >
          {throttled && throttledUntil !== null
            ? remainingLabel(throttledUntil, now)
            : submitting
              ? '인증하는 중'
              : expired
                ? '다시 인증하기'
                : '인증하고 시작하기'}
        </OperationalButton>

        <div className="staff-login__foot">
          <p>
            passcode는 기기별이 아니라 운영진 공용입니다. 기록에는 개인이 아니라
            위에서 고른 스테이션이 남습니다.
          </p>
          <p>
            passcode가 샌 것 같으면 총괄에게 알려 주세요. Settings의
            STAFF_TOKEN_EPOCH를 올리면 모든 기기 인증이 즉시 해제됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
