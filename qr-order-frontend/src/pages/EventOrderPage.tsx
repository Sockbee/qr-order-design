import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppBar } from '../components/AppBar'
import { Button } from '../components/Button'
import { QuantitySelector } from '../components/QuantitySelector'
import { createOrder, mapCreatedOrder } from '../api/orders'
import { ApiClientError } from '../api/client'
import { readStored, writeStored, removeStored, sessionScopedKey } from '../utils/storage'
import type { OrderSession } from '../hooks/useOrderSession'
import type { MenuItemDetail } from '../types/menu'
import type { TableCredentials } from '../types/session'

export function EventOrderPage({ session, menuItems, tableNumber, credentials, liveMode, loading, catalogError, onRetry }: {
  session: OrderSession; menuItems: MenuItemDetail[]; tableNumber: number
  credentials: TableCredentials | null; liveMode: boolean
  loading?: boolean; catalogError?: string; onRetry: () => void
}) {
  const navigate = useNavigate()
  const [step, setStep] = useState<'menu' | 'cart' | 'done'>('menu')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const total = session.cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const count = session.cart.reduce((sum, line) => sum + line.quantity, 0)
  const items = menuItems.filter((item) => (item.coinPrice ?? 0) > 0)
  const submit = async () => {
    if (submitting.current || !session.cart.length) return
    submitting.current = true; setBusy(true); setError(null)
    const key = sessionScopedKey(credentials?.tableToken ?? 'demo', 'pending-coin-order')
    try {
      if (liveMode) {
        if (!credentials) throw new Error('테이블 QR을 다시 확인해 주세요.')
        const signature = JSON.stringify(session.cart)
        const pending = readStored<{ signature: string; id: string } | null>(key, null)
        const id = pending?.signature === signature ? pending.id : crypto.randomUUID()
        writeStored(key, { signature, id })
        const response = await createOrder(credentials, session.cart, id, undefined, 'COIN')
        session.placeOrder(mapCreatedOrder(response, tableNumber)); removeStored(key)
      } else session.placeOrder()
      setStep('done')
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'ORDER_PRICE_CHANGED') {
        const values = (caught.details as { items?: Array<{ unitPrice: number }> })?.items?.map((item) => item.unitPrice) ?? []
        if (values.length === session.cart.length && values.every(Number.isSafeInteger)) { session.repriceCart(values); removeStored(key) }
      }
      setError(caught instanceof Error ? caught.message : '주문을 접수하지 못했습니다. 다시 시도해 주세요.')
    } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="flex flex-col min-h-dvh bg-canvas text-strong">
    <AppBar title={step === 'menu' ? '메뉴' : step === 'cart' ? '엽전 장바구니' : '주문 완료'} chip={`테이블 ${tableNumber}`} onBack={() => !busy && (step === 'cart' ? setStep('menu') : navigate('/menu'))} actions={[{ label: '주문 내역', onClick: () => navigate('/orders') }]} />
    {step === 'menu' && <nav className="flex border-b border-border-default" aria-label="주문 유형"><button className="flex-1 p-4" onClick={() => navigate('/menu')}>일반 주문</button><button className="flex-1 p-4 font-bold border-b-2" aria-current="page">이벤트 주문</button></nav>}
    <main className="flex-1 p-4 flex flex-col gap-4">
      <h1 className="font-display text-[26px]">{step === 'done' ? '엽전 주문이 접수됐어요' : step === 'cart' ? '엽전 주문 확인' : '엽전으로 즐기는 한 잔'}</h1>
      <p className="text-sm text-body">{step === 'done' ? '직원에게 엽전을 전달해 주세요. 수령 확인 후 메뉴를 서빙해 드려요.' : '실물 엽전으로 주문해요. 원화 주문과 별도로 접수되며 할인은 적용되지 않아요.'}</p>
      {error && <p role="alert" className="rounded-lg bg-surface p-3">{error}</p>}
      {step === 'menu' && loading && <p aria-busy="true">메뉴를 불러오고 있어요.</p>}
      {step === 'menu' && catalogError && <div role="alert"><p>{catalogError}</p><Button label="다시 시도" onClick={onRetry} /></div>}
      {step === 'menu' && !loading && !catalogError && <div>{items.length === 0 && <p className="py-8">이벤트 메뉴를 준비하고 있어요.</p>}{items.map((item) => <article key={item.id} className="flex items-center gap-3 py-4 border-b border-dashed border-border-default">
        {item.imageUrl && <img className="size-16 rounded-xl object-cover" src={item.imageUrl} alt="" />}
        <div className="flex-1"><h2 className="font-bold">{item.name}</h2><p className="text-sm text-body mt-1">엽전 {item.coinPrice}개</p></div>
        <Button size="small" variant="weak" label={item.soldOut ? '품절' : '담기'} disabled={item.soldOut} onClick={() => session.addToCart({ itemId: item.id, nameSnapshot: item.name, unitPrice: item.coinPrice!, quantity: 1, maxQuantitySnapshot: item.maxQuantity })} />
      </article>)}</div>}
      {step === 'cart' && <>{session.cart.map((line, index) => <article key={line.itemId} className="py-4 border-b border-border-default flex flex-col gap-3"><div className="flex justify-between gap-2"><h2 className="font-bold">{line.nameSnapshot}</h2><strong>엽전 {line.unitPrice * line.quantity}개</strong></div><div className="flex justify-between"><button disabled={busy} onClick={() => session.removeLine(index)}>삭제</button><QuantitySelector value={line.quantity} min={1} max={line.maxQuantitySnapshot} disabled={busy} ariaLabel={`${line.nameSnapshot} 수량`} onChange={(value) => session.changeQuantity(index, value)} /></div></article>)}<div className="flex justify-between font-bold text-xl"><span>필요한 엽전</span><span>{total}개</span></div><p className="text-sm text-body">고객 주문 → 직원 엽전 수령 → 서빙 완료</p></>}
    </main>
    <footer className="sticky bottom-0 bg-canvas border-t border-border-default p-4 flex flex-col gap-2">
      {step === 'menu' ? <Button block size="xlarge" label={`엽전 ${total}개 · 장바구니 ${count}개`} disabled={!count} onClick={() => setStep('cart')} /> : step === 'cart' ? <><Button block size="xlarge" label={busy ? '접수 중…' : `엽전 ${total}개로 주문하기`} disabled={busy || !count} onClick={() => void submit()} /><Button block variant="weak" label="메뉴 더 담기" disabled={busy} onClick={() => setStep('menu')} /></> : <><Button block size="xlarge" label="주문 내역 보기" onClick={() => navigate('/orders')} /><Button block variant="weak" label="메뉴 보기" onClick={() => navigate('/menu')} /></>}
    </footer>
  </div>
}
