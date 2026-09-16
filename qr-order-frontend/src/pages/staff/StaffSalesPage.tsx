import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StaffNavigation } from '../../components/staff/StaffNavigation'
import { staffNavItems } from '../../components/staff/staffNavItems'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import { StaffEmptyState } from '../../components/staff/StaffEmptyState'
import { useMenuSales } from '../../hooks/useMenuSales'
import { groupMenuSales, koreaDate, SALE_LABELS, SALE_TYPES, saleBreakdown } from '../../utils/menuSales'
import { formatStaffAmount } from '../../utils/price'
import './StaffStationPage.css'
import './StaffSalesPage.css'

export function StaffSalesPage() {
  const [startDate, setStartDate] = useState(koreaDate())
  const [endDate, setEndDate] = useState(koreaDate())
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'quantity' | 'amount'>('quantity')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const sales = useMenuSales(startDate, endDate)
  const navigate = useNavigate()
  useEffect(() => { if (sales.unauthorized) navigate('/staff/login', { replace: true }) }, [sales.unauthorized, navigate])
  const groups = groupMenuSales(sales.rows, category, search, sort)
  const categories = [...new Map(sales.rows.map((row) => [row.categoryId, row.categoryLabel])).entries()]
  const quantity = groups.reduce((sum, group) => sum + group.quantity, 0)
  const amount = groups.reduce((sum, group) => sum + group.amount, 0)
  const coins = saleBreakdown(groups.flatMap((group) => group.rows), 'COIN')
  const service = groups.reduce((sum, group) => sum + saleBreakdown(group.rows, 'SERVICE').quantity, 0)
  const selectPeriod = (days: number) => {
    const today = koreaDate()
    const first = new Date(`${today}T00:00:00+09:00`)
    first.setUTCDate(first.getUTCDate() - days + 1)
    setStartDate(koreaDate(first)); setEndDate(today)
  }
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  return <div className="station-page" data-staff-app>
    <StaffNavigation items={staffNavItems(null)} />
    <main className="station-page__main">
      <header className="station-page__header"><h1 className="station-page__title">판매 통계</h1>
        <p className="station-page__summary">{sales.demo ? '디자인 예시 · ' : ''}주문일 기준 · 한국 시간</p>
      </header>
      <div className="station-page__body sales-page">
        <div className="sales-filters">
          <label><span>시작일</span><input type="date" value={startDate} max={endDate} onChange={(e) => { if (e.target.value) setStartDate(e.target.value) }} /></label>
          <label><span>종료일</span><input type="date" value={endDate} min={startDate} onChange={(e) => { if (e.target.value) setEndDate(e.target.value) }} /></label>
          <button type="button" onClick={() => selectPeriod(1)}>오늘</button>
          <button type="button" onClick={() => selectPeriod(7)}>최근 7일</button>
          <label><span>카테고리</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">전체 카테고리</option>{categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="sales-search"><span>메뉴 검색</span><input type="search" placeholder="메뉴명 검색" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        </div>
        {sales.loading ? <StaffEmptyState title="판매 통계를 불러오는 중이에요" body="주문별 수량과 할인 금액을 확인하고 있습니다" /> : sales.error ?
          <StaffInlineAlert title="판매 통계를 불러오지 못했어요" detail={sales.error.message} actionLabel="다시 시도" onAction={sales.retry} /> : <>
          <div className="sales-summary" aria-label="조회 결과 합계">
            <div><span>총 판매량</span><strong>{quantity.toLocaleString()}개</strong><small>서비스 {service.toLocaleString()}개 포함</small></div>
            <div><span>판매금액 합계</span><strong>{formatStaffAmount(amount)}</strong><small>할인 반영 · 미결제 일반가 포함</small></div>
            <div><span>엽전 사용량</span><strong>{coins.receivedCoins}개</strong><small>미수령 {coins.pendingCoins}개 · 원화 매출 별도</small></div>
          </div>
          <section className="sales-list" aria-label="메뉴별 판매 현황">
            <div className="sales-list__head"><h2>메뉴별 판매 현황</h2><p>메뉴를 누르면 유형별 내역을 볼 수 있어요</p></div>
            {groups.length === 0 ? <StaffEmptyState title="조회 조건에 맞는 주문이 없어요" body="기간이나 카테고리, 검색어를 변경해 주세요." /> :
              <div className="sales-table-scroll"><table className="sales-table">
                <thead><tr><th scope="col">메뉴</th><th scope="col" aria-sort={sort === 'quantity' ? 'descending' : 'none'}><button onClick={() => setSort('quantity')}>판매량 {sort === 'quantity' ? '↓' : ''}</button></th><th scope="col" aria-sort={sort === 'amount' ? 'descending' : 'none'}><button onClick={() => setSort('amount')}>판매금액 {sort === 'amount' ? '↓' : ''}</button></th><th scope="col">집계 구분</th></tr></thead>
                {groups.map((group) => {
                  const open = expanded.has(group.menuId)
                  const detailId = `sales-${encodeURIComponent(group.menuId)}`
                  return <Fragment key={group.menuId}>
                    <tbody><tr className={open ? 'sales-table__selected' : ''}>
                      <th scope="row"><button className="sales-menu-toggle" aria-expanded={open} aria-controls={detailId} onClick={() => toggle(group.menuId)}><span aria-hidden="true">{open ? '⌄' : '›'}</span>{group.name}</button></th>
                      <td>{group.quantity.toLocaleString()}개</td><td>{formatStaffAmount(group.amount)}<br /><small>엽전 {saleBreakdown(group.rows, 'COIN').receivedCoins}개 수령 · {saleBreakdown(group.rows, 'COIN').pendingCoins}개 미수령</small></td><td>일반 · 납부자 · 서비스 · 엽전 합계</td>
                    </tr></tbody>
                    <tbody id={detailId} hidden={!open}>{SALE_TYPES.map((type) => {
                      const part = saleBreakdown(group.rows, type)
                      const rates = part.rates.map((rate) => `${rate}%`).join(' · ')
                      return <tr key={type} className="sales-table__detail"><th scope="row">{SALE_LABELS[type]}</th><td>{part.quantity.toLocaleString()}개</td><td>{type === 'COIN' ? `엽전 ${part.receivedCoins}개` : formatStaffAmount(part.amount)}</td>
                        <td>{type === 'COIN' ? `미수령 ${part.pendingCoins}개 · 할인 제외` : type === 'GENERAL' ? `일반가${part.unpaidQuantity ? ` · 미결제 ${part.unpaidQuantity}개 포함` : ''}` : rates ? `적용 할인율 ${rates}${type === 'SERVICE' ? ' · 별도 정책' : ''}` : type === 'MEMBER' ? '할인 결제 완료 후 분류' : '서비스 주문 없음'}</td></tr>
                    })}</tbody>
                  </Fragment>
                })}
              </table></div>}
          </section>
          <p className="sales-policy">미결제 주문은 일반가로 집계합니다. 할인 결제 완료 시 납부자로 이동하고 할인된 금액을 반영합니다.<br />서비스는 주문 당시 서비스 할인율을 적용해 별도로 집계하며, 메뉴 합계에 포함됩니다. 엽전은 수령 확인한 사용량과 미수령 수량을 분리하고 원화에 합산하지 않습니다. 취소·환불 주문은 제외합니다.</p>
        </>}
      </div>
    </main>
  </div>
}
