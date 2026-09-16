import { useEffect, useState } from 'react'
import { StaffNavigation } from '../../components/staff/StaffNavigation'
import { staffNavItems } from '../../components/staff/staffNavItems'
import { StaffInlineAlert } from '../../components/staff/StaffInlineAlert'
import {
  createAdminTable,
  deleteAdminMenu,
  getAdminSnapshot,
  rotateAdminTableToken,
  saveAdminCategory,
  saveAdminMenu,
  saveAdminSetting,
  saveAdminTable,
} from '../../api/staff/admin'
import type {
  AdminSnapshot,
  TokenResponse,
} from '../../api/staff/admin'
import { useStaffEventState } from '../../hooks/useStaffEvents'
import './StaffSettingsPage.css'

const EDITABLE_SETTINGS = new Set([
  'STORE_NAME',
  'EVENT_OPEN',
  'NOTICE',
  'ORDER_PREFIX',
  'CALL_MIN_INTERVAL_SECONDS',
  'TABLE_DISCOUNT_RATE',
])

function downloadQr(token: TokenResponse) {
  const blob = new Blob([token.qrSvg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${token.tableId}-qr.svg`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function StaffSettingsPage() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [issuedToken, setIssuedToken] = useState<TokenResponse | null>(null)
  const [revision, setRevision] = useState(0)
  const { revision: eventRevision, connected: eventsConnected } = useStaffEventState()

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    let timer: number | undefined
    getAdminSnapshot(controller.signal)
      .then(setSnapshot)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : '설정을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (disposed) return
        timer = window.setTimeout(
          () => setRevision((value) => value + 1),
          eventsConnected ? 60_000 : 10_000,
        )
      })
    return () => {
      disposed = true
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [eventRevision, eventsConnected, revision])

  const perform = (key: string, action: () => Promise<unknown>) => {
    setSaving(key)
    setError(null)
    void action()
      .then(() => setRevision((value) => value + 1))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : '저장하지 못했습니다.'),
      )
      .finally(() => setSaving(null))
  }

  return (
    <div className="staff-settings" data-staff-app>
      <StaffNavigation items={staffNavItems(null)} />
      <main className="staff-settings__main">
        <header className="staff-settings__header">
          <div>
            <h1>운영 설정</h1>
            <p>변경 내용은 고객과 운영 화면에 즉시 반영됩니다.</p>
          </div>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>새로고침</button>
        </header>

        {error && <StaffInlineAlert title="설정 작업을 완료하지 못했어요" detail={error} />}
        {!snapshot && !error && <p className="staff-settings__loading">설정을 불러오는 중입니다.</p>}

        {issuedToken && (
          <section className="staff-settings__token" aria-live="polite">
            <h2>{issuedToken.tableId} 새 QR</h2>
            <p>이 토큰은 닫으면 다시 확인할 수 없습니다.</p>
            <code>{issuedToken.url}</code>
            <div>
              <button type="button" onClick={() => downloadQr(issuedToken)}>QR SVG 받기</button>
              <button type="button" onClick={() => setIssuedToken(null)}>닫기</button>
            </div>
          </section>
        )}

        {snapshot && (
          <div className="staff-settings__sections">
            <section>
              <h2>매장 설정</h2>
              <div className="staff-settings__rows">
                {snapshot.settings.filter((item) => EDITABLE_SETTINGS.has(item.key)).map((setting) => (
                  <label key={setting.key} className="staff-settings__row">
                    <span><strong>{setting.key}</strong><small>{setting.description}</small></span>
                    <input
                      value={setting.value}
                      onChange={(event) => setSnapshot({
                        ...snapshot,
                        settings: snapshot.settings.map((item) => item.key === setting.key ? { ...item, value: event.target.value } : item),
                      })}
                    />
                    <button disabled={saving !== null} type="button" onClick={() => perform(setting.key, () => saveAdminSetting(setting.key, setting.value))}>저장</button>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <div className="staff-settings__section-head">
                <h2>카테고리</h2>
                <button type="button" onClick={() => {
                  const categoryId = window.prompt('새 카테고리 ID (영문 소문자/숫자/하이픈)')?.trim()
                  if (!categoryId) return
                  const label = window.prompt('카테고리 이름')?.trim()
                  if (!label) return
                  perform(categoryId, () => saveAdminCategory({
                    categoryId,
                    label,
                    heading: label,
                    sortOrder: snapshot.categories.length * 10 + 10,
                    active: true,
                  }))
                }}>카테고리 추가</button>
              </div>
              <div className="staff-settings__rows">
                {snapshot.categories.map((category) => (
                  <div key={category.categoryId} className="staff-settings__row staff-settings__row--wide">
                    <code>{category.categoryId}</code>
                    <input value={category.label} aria-label={`${category.categoryId} 이름`} onChange={(event) => setSnapshot({ ...snapshot, categories: snapshot.categories.map((item) => item.categoryId === category.categoryId ? { ...item, label: event.target.value } : item) })} />
                    <input value={category.heading} aria-label={`${category.categoryId} 제목`} onChange={(event) => setSnapshot({ ...snapshot, categories: snapshot.categories.map((item) => item.categoryId === category.categoryId ? { ...item, heading: event.target.value } : item) })} />
                    <input type="number" value={category.sortOrder} aria-label="정렬" onChange={(event) => setSnapshot({ ...snapshot, categories: snapshot.categories.map((item) => item.categoryId === category.categoryId ? { ...item, sortOrder: Number(event.target.value) } : item) })} />
                    <label><input type="checkbox" checked={category.active} onChange={(event) => setSnapshot({ ...snapshot, categories: snapshot.categories.map((item) => item.categoryId === category.categoryId ? { ...item, active: event.target.checked } : item) })} />활성</label>
                    <button disabled={saving !== null} type="button" onClick={() => perform(category.categoryId, () => saveAdminCategory(category))}>저장</button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="staff-settings__section-head">
                <h2>메뉴와 가격</h2>
                <button type="button" onClick={() => {
                  const menuId = window.prompt('새 메뉴 ID (영문 소문자/숫자/하이픈)')?.trim()
                  if (!menuId) return
                  const name = window.prompt('메뉴 이름')?.trim()
                  const category = snapshot.categories.find((item) => item.active) ?? snapshot.categories[0]
                  if (!name || !category) return
                  perform(menuId, () => saveAdminMenu({
                    menuId,
                    categoryId: category.categoryId,
                    name,
                    description: '',
                    basePrice: 0,
                    coinPrice: null,
                    imageUrl: null,
                    available: true,
                    minQuantity: 1,
                    maxQuantity: 10,
                    origin: null,
                    sortOrder: snapshot.menus.length * 10 + 10,
                  }))
                }}>메뉴 추가</button>
              </div>
              <p className="staff-settings__menu-help">판매 중을 해제하면 품절로 표시됩니다. 메뉴 영구 삭제는 목록에서 제거하며, 기존 주문과 판매 통계는 유지됩니다.</p>
              <div className="staff-settings__rows">
                {snapshot.menus.map((menu) => (
                  <div key={menu.menuId} className="staff-settings__row staff-settings__row--menu">
                    <code className="staff-settings__menu-id">{menu.menuId}</code>
                    <input value={menu.name} aria-label={`${menu.menuId} 이름`} onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, name: event.target.value } : item) })} />
                    <input value={menu.description} aria-label={`${menu.menuId} 설명`} placeholder="메뉴 설명" onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, description: event.target.value } : item) })} />
                    <input type="url" value={menu.imageUrl ?? ''} aria-label={`${menu.menuId} 이미지 URL`} placeholder="https://… 이미지 URL" onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, imageUrl: event.target.value || null } : item) })} />
                    <select value={menu.categoryId} onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, categoryId: event.target.value } : item) })}>{snapshot.categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.label}</option>)}</select>
                    <input type="number" value={menu.basePrice} aria-label="가격" onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, basePrice: Number(event.target.value) } : item) })} />
                    <input type="number" value={menu.sortOrder} aria-label="정렬" onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, sortOrder: Number(event.target.value) } : item) })} />
                    <label><input type="checkbox" checked={menu.available} onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, available: event.target.checked } : item) })} />판매 중</label>
                    <label><input type="checkbox" checked={menu.coinPrice !== null} onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, coinPrice: event.target.checked ? 1 : null } : item) })} />이벤트 주문 허용</label>
                    <label className="staff-settings__coin-price">엽전 가격
                      <input type="number" min={1} step={1} disabled={menu.coinPrice === null} value={menu.coinPrice ?? ''} aria-label={`${menu.name} 엽전 가격`} onChange={(event) => setSnapshot({ ...snapshot, menus: snapshot.menus.map((item) => item.menuId === menu.menuId ? { ...item, coinPrice: Number(event.target.value) } : item) })} />개
                    </label>
                    <div className="staff-settings__menu-actions">
                      <button disabled={saving !== null || (menu.coinPrice !== null && (!Number.isInteger(menu.coinPrice) || menu.coinPrice < 1 || menu.coinPrice > 2147483647))} type="button" onClick={() => perform(menu.menuId, () => saveAdminMenu(menu))}>저장</button>
                      <button className="staff-settings__danger" disabled={saving !== null} type="button" onClick={() => {
                        if (!window.confirm(`“${menu.name}” 메뉴를 영구 삭제할까요?\n고객·POS 메뉴 목록에서 제거되며 복구할 수 없습니다.\n기존 주문과 판매 통계는 유지됩니다.`)) return
                        perform(`delete-${menu.menuId}`, () => deleteAdminMenu(menu.menuId))
                      }}>메뉴 영구 삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>


            <section>
              <div className="staff-settings__section-head">
                <h2>테이블과 QR</h2>
                <button type="button" onClick={() => {
                  const tableId = window.prompt('새 테이블 ID (예: T20)')?.trim()
                  if (!tableId) return
                  const displayName = window.prompt('표시 이름', `테이블 ${Number(tableId.slice(1)) || ''}`)?.trim()
                  if (!displayName) return
                  perform(tableId, () => createAdminTable(tableId, displayName, snapshot.tables.length + 1).then((token) => setIssuedToken(token)))
                }}>테이블 추가</button>
              </div>
              <div className="staff-settings__rows">
                {snapshot.tables.map((table) => (
                  <div key={table.tableId} className="staff-settings__row staff-settings__row--table">
                    <code>{table.tableId}</code>
                    <input value={table.displayName} onChange={(event) => setSnapshot({ ...snapshot, tables: snapshot.tables.map((item) => item.tableId === table.tableId ? { ...item, displayName: event.target.value } : item) })} />
                    <input type="number" value={table.sortOrder} aria-label="정렬" onChange={(event) => setSnapshot({ ...snapshot, tables: snapshot.tables.map((item) => item.tableId === table.tableId ? { ...item, sortOrder: Number(event.target.value) } : item) })} />
                    <label><input type="checkbox" checked={table.active} onChange={(event) => setSnapshot({ ...snapshot, tables: snapshot.tables.map((item) => item.tableId === table.tableId ? { ...item, active: event.target.checked } : item) })} />활성</label>
                    <small>QR v{table.tokenVersion}</small>
                    <button disabled={saving !== null} type="button" onClick={() => perform(table.tableId, () => saveAdminTable(table))}>저장</button>
                    <button className="staff-settings__danger" disabled={saving !== null} type="button" onClick={() => {
                      if (!window.confirm(`${table.tableId}의 기존 QR을 무효화하고 새 QR을 발급할까요?`)) return
                      perform(`rotate-${table.tableId}`, () => rotateAdminTableToken(table.tableId).then((token) => setIssuedToken(token)))
                    }}>QR 재발급</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
