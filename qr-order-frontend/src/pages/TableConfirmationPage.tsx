import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { TableChip } from '../components/TableChip'
import type { TableSession } from '../types/session'

interface TableConfirmationPageProps {
  session: TableSession | null
  loading?: boolean
  errorMessage?: string
  retryable?: boolean
  onRetry?: () => void
  onStart: () => void
}

export function TableConfirmationPage({
  session,
  loading = false,
  errorMessage,
  retryable = false,
  onRetry,
  onStart,
}: TableConfirmationPageProps) {
  if (loading) {
    return (
      <div className="flex flex-col min-h-dvh bg-canvas" aria-busy="true">
        <main className="flex flex-1 flex-col items-start gap-4 pt-20 px-4 pb-0">
          <div className="bg-weak rounded-[4px] w-[180px] h-8" />
          <div className="bg-weak rounded-[4px] w-16 h-7" />
          <div className="bg-weak rounded-[4px] w-24 h-8" />
          <div className="bg-weak rounded-[4px] w-full h-10" />
        </main>
        <div className="p-4 bg-canvas">
          <Button block size="xlarge" variant="fill" label="메뉴 보기" loading />
        </div>
        <div className="h-[var(--layout-safe-area)] bg-canvas" />
      </div>
    )
  }

  if (!session || errorMessage) {
    return (
      <div className="flex flex-col min-h-dvh bg-canvas">
        <main className="flex flex-1 flex-col items-start gap-4 pt-20 px-4 pb-0">
          <h1 className="font-bold text-2xl leading-9 text-strong">
            테이블 정보를 불러오지 못했어요
          </h1>
          <p className="w-full text-sm leading-[21px] font-normal text-body">
            {errorMessage ?? 'QR 코드를 다시 스캔해 주세요.'}
          </p>
        </main>
        {retryable && onRetry && (
          <div className="p-4 bg-canvas">
            <Button
              block
              size="xlarge"
              variant="fill"
              label="다시 시도"
              onClick={onRetry}
            />
          </div>
        )}
        <div className="h-[var(--layout-safe-area)] bg-canvas" />
      </div>
    )
  }

  const { storeName, open, tableNumber, notice } = session

  return (
    <div className="flex flex-col min-h-dvh bg-canvas">
      <main className="flex flex-1 flex-col items-start gap-4 pt-20 px-4 pb-0">
        <h1 className="font-bold text-2xl leading-9 text-strong">{storeName}</h1>

        <Badge size="medium">{open ? '영업 중' : '영업 종료'}</Badge>

        <TableChip tableNumber={tableNumber} />

        <p className="w-full text-sm leading-[21px] font-normal text-body">{notice}</p>
      </main>

      <div className="p-4 bg-canvas">
        <Button block size="xlarge" variant="fill" label="메뉴 보기" onClick={onStart} />
      </div>
      <div className="h-[var(--layout-safe-area)] bg-canvas" />
    </div>
  )
}
