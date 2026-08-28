import './TableChoice.css'

interface TableChoiceProps {
  tableId: string
  /** `비어 있음` / `사용 중`. Occupied tables cannot receive a move. */
  caption: string
  disabled?: boolean
  selected?: boolean
  onSelect?: (tableId: string) => void
}

/**
 * One destination tile in the move dialog (93:861). 148×64, label over
 * caption. An occupied table stays visible but unselectable — hiding it would
 * leave the operator wondering where it went.
 */
export function TableChoice({
  tableId,
  caption,
  disabled = false,
  selected = false,
  onSelect,
}: TableChoiceProps) {
  return (
    <button
      type="button"
      className={`table-choice${selected ? ' table-choice--selected' : ''}`}
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => onSelect?.(tableId)}
    >
      <span className="table-choice__table">{tableId}</span>
      <span className="table-choice__caption">{caption}</span>
    </button>
  )
}
