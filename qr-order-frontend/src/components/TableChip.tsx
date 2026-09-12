interface TableChipProps {
  tableNumber: number
}

export function TableChip({ tableNumber }: TableChipProps) {
  return (
    <p className="inline-flex items-center h-11 px-4 rounded-row bg-primary text-on-primary font-display font-normal text-2xl leading-none">
      테이블 {tableNumber}
    </p>
  )
}
