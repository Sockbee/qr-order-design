interface TableChipProps {
  tableNumber: number
}

export function TableChip({ tableNumber }: TableChipProps) {
  return (
    <p className="inline-flex items-center py-3 px-4 rounded-btn-sm bg-weak text-link font-bold text-2xl leading-9">
      테이블 {tableNumber}
    </p>
  )
}
