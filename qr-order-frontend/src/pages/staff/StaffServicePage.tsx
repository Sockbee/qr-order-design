import { useMemo, useState } from 'react'
import './StaffServicePage.css'
import { CategoryTabs } from '../../components/CategoryTabs'
import { QuantitySelector } from '../../components/QuantitySelector'
import { OperationalButton } from '../../components/staff/OperationalButton'
import { StaffEmptyState } from '../../components/staff/StaffEmptyState'
import { StaffMemberPicker } from '../../components/staff/StaffMemberPicker'
import { StaffMenuCard } from '../../components/staff/StaffMenuCard'
import { StaffNavigation } from '../../components/staff/StaffNavigation'
import { staffNavItems } from '../../components/staff/staffNavItems'
import { formatStaffAmount } from '../../utils/price'
import type { MenuCategory, MenuItemSummary } from '../../types/menu'
import type { StaffMember, StaffServiceCharge } from '../../types/staff'

export interface ServiceDraftLine {
  itemId: string
  name: string
  unitPrice: number
  quantity: number
}

interface StaffServicePageProps {
  tableId: string
  categories: MenuCategory[]
  items: MenuItemSummary[]
  members: StaffMember[]
  membersLoading: boolean
  draft: ServiceDraftLine[]
  chargedStaffId: string | null
  serviceReason: string
  charge: StaffServiceCharge
  submitting: boolean
  onAdd: (itemId: string) => void
  onQuantityChange: (itemId: string, quantity: number) => void
  onSelectStaff: (staffId: string) => void
  onReasonChange: (reason: string) => void
  onSubmit: () => void
  onClose: () => void
}

const ALL_CATEGORY: MenuCategory = {
  id: '__all',
  label: '전체',
  heading: '전체',
}

/** §4.20 caps the reason at 100 characters. */
const REASON_MAX_LENGTH = 100

/**
 * A10 — Service Grant. Structurally A03 (92:817): rail, menu column, 420px
 * panel. Three things differ, all of them consequences of who pays.
 *
 * 1. The panel carries a 부담 스태프 picker and a reason field above the
 *    total, because a grant without a named sponsor is not writable (§4.20).
 * 2. The total is shown twice — 손님 청구 ₩0 and the staff member's 부담액 —
 *    since the whole point of the screen is that those are different numbers.
 * 3. There is a confirm dialog. A03 has none because its draft stays
 *    editable; a service grant does not (§4.18).
 *
 * 품절 관리 is not repeated here. It lives on A03 and duplicating it would
 * mean two screens that can flip the same switch.
 */
export function StaffServicePage({
  tableId,
  categories,
  items,
  members,
  membersLoading,
  draft,
  chargedStaffId,
  serviceReason,
  charge,
  submitting,
  onAdd,
  onQuantityChange,
  onSelectStaff,
  onReasonChange,
  onSubmit,
  onClose,
}: StaffServicePageProps) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState(ALL_CATEGORY.id)

  const tabs = useMemo(() => [ALL_CATEGORY, ...categories], [categories])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return items.filter((item) => {
      if (categoryId !== ALL_CATEGORY.id && item.categoryId !== categoryId) {
        return false
      }
      if (!term) return true
      return item.name.toLowerCase().includes(term)
    })
  }, [categoryId, items, query])

  const selectedMember = members.find(
    (member) => member.staffId === chargedStaffId,
  )
  const ready = draft.length > 0 && Boolean(chargedStaffId)

  return (
    <div className="service-order" data-staff-app>
      <StaffNavigation items={staffNavItems(null)} />

      <main className="service-order__main">
        <header className="service-order__header">
          <h1 className="service-order__title">{`${tableId} 서비스 지급`}</h1>
          <p className="service-order__lead">손님 청구 0원 · 스태프 부담</p>
        </header>

        <div className="service-order__body">
          <input
            type="search"
            className="service-order__search"
            placeholder="메뉴 검색"
            aria-label="메뉴 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <CategoryTabs
            categories={tabs}
            selectedId={categoryId}
            onSelect={setCategoryId}
            panelId="service-order-menu"
            variant="pill"
          />
          <div
            className="service-order__grid"
            id="service-order-menu"
            role="tabpanel"
          >
            {visible.map((item) => (
              <StaffMenuCard key={item.id} item={item} onAdd={onAdd} />
            ))}
          </div>
          {visible.length === 0 && (
            <StaffEmptyState
              title="찾는 메뉴가 없어요"
              body="검색어나 분류를 바꿔 보세요"
            />
          )}
        </div>
      </main>

      <aside className="service-order__panel" aria-label="서비스 지급 내용">
        <header className="service-order__panel-head">
          <h2 className="service-order__panel-title">지급할 항목</h2>
          <p className="service-order__panel-lead">
            테이블 청구는 0원 · 정가의 {100 - charge.discountRate}%를 스태프가 부담
          </p>
        </header>

        <div className="service-order__draft">
          {draft.length === 0 ? (
            <StaffEmptyState
              title="아직 담은 항목이 없어요"
              body="왼쪽에서 메뉴를 탭하면 여기에 쌓입니다"
            />
          ) : (
            <ul className="service-order__draft-list">
              {draft.map((line) => (
                <li key={line.itemId} className="service-order__draft-line">
                  <div className="service-order__draft-info">
                    <span className="service-order__draft-name">
                      {line.name}
                    </span>
                    <span className="service-order__draft-price">
                      {`정가 ${formatStaffAmount(line.unitPrice)}`}
                    </span>
                  </div>
                  <QuantitySelector
                    value={line.quantity}
                    min={0}
                    ariaLabel={`${line.name} 수량`}
                    onChange={(next) => onQuantityChange(line.itemId, next)}
                  />
                  <span className="service-order__draft-amount">
                    {formatStaffAmount(line.unitPrice * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="service-order__charge">
          <h3 className="service-order__section-title">부담 스태프</h3>
          <StaffMemberPicker
            members={members}
            selectedId={chargedStaffId}
            loading={membersLoading}
            onSelect={onSelectStaff}
          />
        </div>

        <footer className="service-order__panel-foot">
          <label className="service-order__reason-label" htmlFor="service-reason">
            사유 <span className="service-order__optional">선택</span>
          </label>
          <input
            id="service-reason"
            type="text"
            className="service-order__reason"
            placeholder="대기 사과, 메뉴 지연 등"
            maxLength={REASON_MAX_LENGTH}
            value={serviceReason}
            onChange={(event) => onReasonChange(event.target.value)}
          />

          <p className="service-order__total service-order__total--guest">
            <span>손님 청구</span>
            <strong>{formatStaffAmount(0)}</strong>
          </p>
          <p className="service-order__total">
            <span>
              {selectedMember ? `${selectedMember.name} 부담액` : '스태프 부담액'}
            </span>
            <strong>{formatStaffAmount(charge.chargeAmount)}</strong>
          </p>

          <OperationalButton
            block
            loading={submitting}
            disabled={!ready}
            onClick={onSubmit}
          >
            서비스 지급
          </OperationalButton>
          {!ready && draft.length > 0 && (
            <p className="service-order__hint">
              부담할 스태프를 선택해야 지급할 수 있어요
            </p>
          )}
          <OperationalButton block variant="secondary" onClick={onClose}>
            닫기
          </OperationalButton>
        </footer>
      </aside>
    </div>
  )
}
