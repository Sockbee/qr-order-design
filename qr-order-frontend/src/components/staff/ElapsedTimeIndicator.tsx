import './ElapsedTimeIndicator.css'
import { elapsedLevel, TABLE_ELAPSED } from '../../utils/elapsed'
import type { ElapsedThresholds } from '../../utils/elapsed'

/**
 * staff/ElapsedTimeIndicator (82:27). Elapsed time is the priority signal —
 * it replaces manual sorting. Grey → amber → a red chip, rising gradually.
 * There is deliberately no full-screen alarm: only the late item escalates.
 */
export function ElapsedTimeIndicator({
  minutes,
  /** `대기` on the serving queue, `지연` once late. */
  suffix,
  thresholds = TABLE_ELAPSED,
}: {
  minutes: number
  suffix?: string
  thresholds?: ElapsedThresholds
}) {
  const level = elapsedLevel(minutes, thresholds)
  const label =
    level === 'delayed'
      ? `${minutes}분 지연`
      : minutes < 1
        ? '방금'
        : `${minutes}분${suffix ? ` ${suffix}` : ''}`

  return (
    <span className={`elapsed elapsed--${level}`}>{label}</span>
  )
}
