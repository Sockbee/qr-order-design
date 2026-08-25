import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { TableChip } from '../components/TableChip'
import type { TableSession } from '../types/session'
import './TableConfirmationPage.css'

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
      <div className="table-confirmation" aria-busy="true">
        <main className="table-confirmation__content">
          <div className="table-confirmation__skeleton table-confirmation__skeleton--title" />
          <div className="table-confirmation__skeleton table-confirmation__skeleton--badge" />
          <div className="table-confirmation__skeleton table-confirmation__skeleton--table" />
          <div className="table-confirmation__skeleton table-confirmation__skeleton--notice" />
        </main>
        <div className="table-confirmation__footer">
          <Button block size="xlarge" variant="fill" label="메뉴 보기" loading />
        </div>
        <div className="table-confirmation__safe-area" />
      </div>
    )
  }

  if (!session || errorMessage) {
    return (
      <div className="table-confirmation">
        <main className="table-confirmation__content">
          <h1 className="table-confirmation__store-name">
            테이블 정보를 불러오지 못했어요
          </h1>
          <p className="table-confirmation__notice">
            {errorMessage ?? 'QR 코드를 다시 스캔해 주세요.'}
          </p>
        </main>
        {retryable && onRetry && (
          <div className="table-confirmation__footer">
            <Button
              block
              size="xlarge"
              variant="fill"
              label="다시 시도"
              onClick={onRetry}
            />
          </div>
        )}
        <div className="table-confirmation__safe-area" />
      </div>
    )
  }

  const { storeName, open, tableNumber, notice } = session

  return (
    <div className="table-confirmation">
      <main className="table-confirmation__content">
        <h1 className="table-confirmation__store-name">{storeName}</h1>

        <Badge size="medium">{open ? '영업 중' : '영업 종료'}</Badge>

        <TableChip tableNumber={tableNumber} />

        <p className="table-confirmation__notice">{notice}</p>
      </main>

      <div className="table-confirmation__footer">
        <Button block size="xlarge" variant="fill" label="메뉴 보기" onClick={onStart} />
      </div>
      <div className="table-confirmation__safe-area" />
    </div>
  )
}
