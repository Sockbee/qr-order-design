import './StationPicker.css'
import { STAFF_STATIONS } from '../../api/staff/client'
import type { StaffStation } from '../../api/staff/client'

interface StationPickerProps {
  value: StaffStation | null
  disabled?: boolean
  onChange: (station: StaffStation) => void
}

/**
 * A09 (113:1800). Four fixed presets, not free text — the backend rejects
 * anything else, because a station spelled differently every shift makes the
 * audit log impossible to aggregate (§4.9).
 *
 * A radiogroup rather than four buttons: exactly one is chosen, and arrow
 * keys should move between them.
 */
export function StationPicker({
  value,
  disabled = false,
  onChange,
}: StationPickerProps) {
  return (
    <div className="station-picker" role="radiogroup" aria-label="스테이션">
      {STAFF_STATIONS.map((station) => {
        const selected = station === value
        return (
          <button
            key={station}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={`station-picker__option${
              selected ? ' station-picker__option--selected' : ''
            }`}
            onClick={() => onChange(station)}
          >
            {station}
          </button>
        )
      })}
    </div>
  )
}
