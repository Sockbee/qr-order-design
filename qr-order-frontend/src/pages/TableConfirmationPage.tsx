import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { TableChip } from '../components/TableChip'
import type { TableSession } from '../types/session'
import './TableConfirmationPage.css'

interface TableConfirmationPageProps {
  session: TableSession
  onStart: () => void
}

export function TableConfirmationPage({
  session,
  onStart,
}: TableConfirmationPageProps) {
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
