import { useMemo, useState } from 'react'
import './StaffAddOrderPage.css'
import { CategoryTabs } from '../../components/CategoryTabs'
import { QuantitySelector } from '../../components/QuantitySelector'
import { OperationalButton } from '../../components/staff/OperationalButton'
import { StaffEmptyState } from '../../components/staff/StaffEmptyState'
import { StaffNavigation } from '../../components/staff/StaffNavigation'
import {
  AvailabilityCard,
  StaffMenuCard,
} from '../../components/staff/StaffMenuCard'
import { formatStaffAmount } from '../../utils/price'
import type { MenuCategory, MenuItemSummary } from '../../types/menu'

export interface OrderDraftLine {
  itemId: string
  name: string
  optionSummary: string
  unitPrice: number
  quantity: number
}

interface StaffAddOrderPageProps {
  tableId: string
  categories: MenuCategory[]
  items: MenuItemSummary[]
  draft: OrderDraftLine[]
  note: string
  submitting: boolean
  togglingItemId: string | null
  onAdd: (itemId: string) => void
  onQuantityChange: (itemId: string, quantity: number) => void
  onNoteChange: (note: string) => void
  onSetSoldOut: (itemId: string, soldOut: boolean) => void
  onSubmit: () => void
  onClose: () => void
}

const ALL_CATEGORY: MenuCategory = {
  id: '__all',
  label: '전체',
  heading: '전체',
}

/**
 * A03 — Add Order (92:817). Staff placing an order on the diner's behalf.
 *
 * Tapping a tile adds it straight to the draft on the right — no confirm
 * sheet, because the draft *is* the confirmation and every line there is
 * still editable. The panel says so out loud.
 */
export function StaffAddOrderPage({
  tableId,
  categories,
  items,
  draft,
  note,
  submitting,
  togglingItemId,
  onAdd,
  onQuantityChange,
  onNoteChange,
  onSetSoldOut,
  onSubmit,
  onClose,
}: StaffAddOrderPageProps) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState(ALL_CATEGORY.id)
  const [managing, setManaging] = useState(false)

  const tabs = useMemo(
    () => [ALL_CATEGORY, ...categories],
    [categories],
  )

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

  const total = draft.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  )

  return (
    <div className="add-order" data-staff-app>
      <StaffNavigation
        items={[
          { label: '테이블', to: '/staff/tables', count: null },
          { label: '주방', to: '/staff/kitchen', count: null },
          { label: '서빙', to: '/staff/serving', count: null },
          { label: '결제', to: '/staff/payment', count: null },
          { label: '설정', to: '/staff/settings', count: null },
        ]}
      />

      <main className="add-order__main">
        <header className="add-order__header">
          <h1 className="add-order__title">{`${tableId} 주문 추가`}</h1>
          <OperationalButton
            variant="secondary"
            size="md"
            aria-pressed={managing}
            onClick={() => setManaging((current) => !current)}
          >
            {managing ? '주문으로 돌아가기' : '품절 관리'}
          </OperationalButton>
        </header>

        <div className="add-order__body">
          {managing ? (
            <>
              <p className="add-order__manage-lead">
                재고 관리 제품이 아닙니다. 목적은 하나 — 없는 음식이 주문되지 않게
                막는 것. 한 번 탭으로 전환되고 확인 단계는 없습니다.
              </p>
              <div className="add-order__grid">
                {items.map((item) => (
                  <AvailabilityCard
                    key={item.id}
                    item={item}
                    busy={togglingItemId === item.id}
                    onChange={onSetSoldOut}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <input
                type="search"
                className="add-order__search"
                placeholder="메뉴 검색"
                aria-label="메뉴 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <CategoryTabs
                categories={tabs}
                selectedId={categoryId}
                onSelect={setCategoryId}
                panelId="add-order-menu"
                variant="pill"
              />
              <div className="add-order__grid" id="add-order-menu" role="tabpanel">
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
            </>
          )}
        </div>
      </main>

      <aside className="add-order__panel" aria-label="담은 항목">
        <header className="add-order__panel-head">
          <h2 className="add-order__panel-title">담은 항목</h2>
          <p className="add-order__panel-lead">
            탭하면 바로 담깁니다 · 확인 화면 없음
          </p>
        </header>

        <div className="add-order__draft">
          {draft.length === 0 ? (
            <StaffEmptyState
              title="아직 담은 항목이 없어요"
              body="왼쪽에서 메뉴를 탭하면 여기에 쌓입니다"
            />
          ) : (
            <ul className="add-order__draft-list">
              {draft.map((line) => (
                <li key={line.itemId} className="add-order__draft-line">
                  <div className="add-order__draft-info">
                    <span className="add-order__draft-name">{line.name}</span>
                    <span className="add-order__draft-option">
                      {line.optionSummary}
                    </span>
                  </div>
                  <QuantitySelector
                    value={line.quantity}
                    min={0}
                    ariaLabel={`${line.name} 수량`}
                    onChange={(next) => onQuantityChange(line.itemId, next)}
                  />
                  <span className="add-order__draft-amount">
                    {formatStaffAmount(line.unitPrice * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="add-order__panel-foot">
          <input
            type="text"
            className="add-order__note"
            placeholder="주문 메모 추가"
            aria-label="주문 메모"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
          <p className="add-order__total">
            <span>합계</span>
            <strong>{formatStaffAmount(total)}</strong>
          </p>
          <OperationalButton
            block
            loading={submitting}
            disabled={draft.length === 0}
            onClick={onSubmit}
          >
            주문 넣기
          </OperationalButton>
          <OperationalButton block variant="secondary" onClick={onClose}>
            닫기
          </OperationalButton>
        </footer>
      </aside>
    </div>
  )
}
