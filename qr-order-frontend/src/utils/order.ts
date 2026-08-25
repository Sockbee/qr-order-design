/** "오후 7:24" — the round timestamp shown on S08. */
export function formatOrderTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  })
}
