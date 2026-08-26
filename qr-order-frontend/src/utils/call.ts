/**
 * "방금 호출됨" / "3분 전 호출" — how long the diner has been waiting.
 *
 * The staff side groups a table's pending calls and sorts by the *oldest*
 * one, so this is the same number both sides reason about.
 */
export function formatCallElapsed(isoTimestamp: string, now = Date.now()): string {
  const elapsedMs = now - new Date(isoTimestamp).getTime()
  const minutes = Math.floor(elapsedMs / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return '방금 호출됨'
  return `${minutes}분 전 호출`
}
