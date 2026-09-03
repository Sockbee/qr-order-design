import { useMemo, useState } from 'react'
import './StaffMemberPicker.css'
import { StaffEmptyState } from './StaffEmptyState'
import type { StaffMember } from '../../types/staff'

interface StaffMemberPickerProps {
  members: StaffMember[]
  selectedId: string | null
  loading: boolean
  onSelect: (staffId: string) => void
}

/**
 * Who carries the cost of a service grant (§4.20).
 *
 * A roster of dozens does not fit the 148×64 `TableChoice` tiles the move
 * dialog uses, so this is a searchable radio list instead — the row styling
 * follows `.operation-dialog__option` so it still reads as the same family.
 *
 * There is no free-text fallback and no "기타" row on purpose: schema §19
 * says the roster is the entire input domain, and an unmatched name would
 * produce a charge nobody can be asked to pay.
 */
export function StaffMemberPicker({
  members,
  selectedId,
  loading,
  onSelect,
}: StaffMemberPickerProps) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return members
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        (member.affiliation ?? '').toLowerCase().includes(term),
    )
  }, [members, query])

  return (
    <div className="member-picker">
      <input
        type="search"
        className="member-picker__search"
        placeholder="이름 또는 부서 검색"
        aria-label="부담 스태프 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div
        className="member-picker__list"
        role="radiogroup"
        aria-label="부담 스태프"
      >
        {loading && (
          <p className="member-picker__loading">명단을 불러오는 중이에요</p>
        )}

        {!loading &&
          visible.map((member) => {
            const selected = member.staffId === selectedId
            return (
              <button
                key={member.staffId}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`member-picker__row${
                  selected ? ' member-picker__row--selected' : ''
                }`}
                onClick={() => onSelect(member.staffId)}
              >
                <span className="member-picker__radio" aria-hidden="true" />
                <span className="member-picker__text">
                  <span className="member-picker__name">{member.name}</span>
                  {member.affiliation && (
                    <span className="member-picker__affiliation">
                      {member.affiliation}
                    </span>
                  )}
                </span>
              </button>
            )
          })}

        {!loading && visible.length === 0 && (
          <StaffEmptyState
            title="찾는 인원이 없어요"
            body="검색어를 바꾸거나 명단 등록을 확인해 주세요"
          />
        )}
      </div>
    </div>
  )
}
