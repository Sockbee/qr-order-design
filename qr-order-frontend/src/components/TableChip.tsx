import './TableChip.css'

interface TableChipProps {
  tableNumber: number
}

export function TableChip({ tableNumber }: TableChipProps) {
  return <p className="table-chip">테이블 {tableNumber}</p>
}
