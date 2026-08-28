import type { StaffElapsedLevel } from '../types/staff'

/**
 * Grey → amber → red, as staff/ElapsedTimeIndicator (82:27) describes.
 *
 * The thresholds differ by station because the waits mean different things.
 * A00 gives one example ladder (18 normal / 24 warning / 38 delayed) but the
 * screens contradict it: B01 draws 31분 as 지연 while 16분 is not, and B02
 * draws 6분 as amber and 14분 as 지연. A dish waiting under the heat lamp goes
 * cold far sooner than one still being cooked, so these are separate ladders
 * rather than one number. Exact values are ours — see the PR document.
 */
export interface ElapsedThresholds {
  warning: number
  delayed: number
}

export const TABLE_ELAPSED: ElapsedThresholds = { warning: 24, delayed: 35 }
export const KITCHEN_ELAPSED: ElapsedThresholds = { warning: 24, delayed: 30 }
export const SERVING_ELAPSED: ElapsedThresholds = { warning: 5, delayed: 12 }

export function elapsedLevel(
  minutes: number,
  thresholds: ElapsedThresholds = TABLE_ELAPSED,
): StaffElapsedLevel {
  if (minutes >= thresholds.delayed) return 'delayed'
  if (minutes >= thresholds.warning) return 'warning'
  return 'normal'
}
