import { useEffect, useState } from 'react'
import logo from '../assets/logo.png'
import { Button } from '../components/Button'
import { WelcomeEmbers } from '../components/WelcomeEmbers'
import type { TableSession } from '../types/session'
import './TableConfirmationPage.css'

interface TableConfirmationPageProps {
  session: TableSession | null
  loading?: boolean
  errorMessage?: string
  retryable?: boolean
  onRetry?: () => void
  onStart: () => void
}

export function TableConfirmationPage({
  session, loading = false, errorMessage, retryable = false, onRetry, onStart,
}: TableConfirmationPageProps) {
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPaused(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  const failed = !loading && (!session || Boolean(errorMessage))

  return (
    <div className="welcome" data-paused={paused}>
      <WelcomeEmbers paused={paused} />
      <button className="welcome-motion" type="button" aria-pressed={paused}
        aria-label="배경 애니메이션 일시 정지" onClick={() => setPaused((value) => !value)}>
        {paused ? '움직임 켜기' : '움직임 끄기'}
      </button>
      <main className="welcome-content" aria-busy={loading || undefined}>
        <div className="welcome-brand">
          <img className="welcome-logo" src={logo} alt="솥가마" width="198" height="198" />
          <h1 className="welcome-title">소프트 일일호프</h1>
        </div>

        {loading ? (
          <div className="welcome-table" role="status">
            <p className="welcome-table-caption">자리를 확인하고 있어요</p>
            <span className="welcome-skeleton" aria-hidden="true" />
          </div>
        ) : failed ? (
          <div className="welcome-error" role="alert">
            <h2>테이블 정보를 불러오지 못했어요</h2>
            <p>{errorMessage ?? 'QR 코드를 다시 스캔해 주세요.'}</p>
          </div>
        ) : session && (
          <div className="welcome-table">
            <p className="welcome-table-caption">지금 앉아 계신 자리</p>
            <p className="welcome-table-number"><strong>{session.tableNumber}</strong><span>번 테이블</span></p>
          </div>
        )}

        {!loading && !failed && session?.notice && <p className="welcome-notice">{session.notice}</p>}
      </main>

      <footer className="welcome-footer">
        {loading ? (
          <Button className="welcome-cta" block aria-label="메뉴 보기" label="메뉴 보기" loading />
        ) : failed ? (
          retryable && onRetry && <Button className="welcome-cta" block label="다시 시도" onClick={onRetry} />
        ) : (
          <Button className="welcome-cta" block label="메뉴 보기" onClick={onStart} />
        )}
      </footer>
    </div>
  )
}
