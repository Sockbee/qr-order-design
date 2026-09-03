import { useMemo } from 'react'
import './StaffAvailabilityPage.css'
import { StaffStationPage } from './StaffStationPage'
import { AvailabilityCard } from '../../components/staff/StaffMenuCard'
import type { MenuItemSummary } from '../../types/menu'

interface StaffAvailabilityPageProps {
  items: MenuItemSummary[]
  loading: boolean
  togglingItemId: string | null
  onSetSoldOut: (itemId: string, soldOut: boolean) => void
}

/**
 * 품절 관리, on its own screen.
 *
 * It used to be a mode toggle inside A03 — Add Order. When A02 stopped
 * placing orders on the diner's behalf, A03 lost its entry point and this
 * would have gone with it, so it moved out. It is the one catalog action
 * performed mid-service, standing up, and it does not belong behind a screen
 * about something else.
 *
 * Split into 판매 중 / 품절 rather than one flat grid. The question the
 * screen exists to answer is "what is sold out right now", and flipping a
 * switch moves the card between sections — which is the same shape as
 * B03's 결제 대기/완료 and B04's 미정산/정산 완료.
 *
 * Still not an inventory product (102:1579): one tap flips it, no confirm
 * step, because flipping it back is the undo.
 */
export function StaffAvailabilityPage({
  items,
  loading,
  togglingItemId,
  onSetSoldOut,
}: StaffAvailabilityPageProps) {
  const { onSale, soldOut } = useMemo(
    () => ({
      onSale: items.filter((item) => !item.soldOut),
      soldOut: items.filter((item) => item.soldOut),
    }),
    [items],
  )

  const grid = (rows: MenuItemSummary[]) => (
    <div className="availability-page__grid">
      {rows.map((item) => (
        <AvailabilityCard
          key={item.id}
          item={item}
          busy={togglingItemId === item.id}
          onChange={onSetSoldOut}
        />
      ))}
    </div>
  )

  return (
    <StaffStationPage
      title="품절 관리"
      summary={
        loading ? null : `품절 ${soldOut.length} · 판매 중 ${onSale.length}`
      }
      counts={null}
      loading={loading}
      onRetry={() => window.location.reload()}
      sections={[
        {
          id: 'sold-out',
          title: '품절',
          count: soldOut.length,
          empty: {
            title: '품절된 메뉴가 없어요',
            body: '재료가 떨어지면 아래에서 품절로 바꿔 주세요',
          },
          cards: grid(soldOut),
        },
        {
          id: 'on-sale',
          title: '판매 중',
          count: onSale.length,
          empty: {
            title: '판매 중인 메뉴가 없어요',
            body: '메뉴가 등록되면 여기에 표시됩니다',
          },
          cards: grid(onSale),
        },
      ]}
    />
  )
}
