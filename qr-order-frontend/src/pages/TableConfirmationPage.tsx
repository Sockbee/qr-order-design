import logoPaper from '../assets/logo-paper.png'
import { Button } from '../components/Button'
import type { TableSession } from '../types/session'

interface TableConfirmationPageProps {
  session: TableSession | null
  loading?: boolean
  errorMessage?: string
  retryable?: boolean
  onRetry?: () => void
  onStart: () => void
}

/** bg-brand stays 황토 in both modes: brand, not theme. */
function BrandBlock({ storeName }: { storeName?: string }) {
  return (
    <div className="flex flex-none flex-col items-center justify-center gap-3.5 h-[min(440px,52dvh)] min-h-[280px] pt-[var(--layout-safe-area-top)] bg-brand rounded-b-[36px]">
      <img className="size-[196px]" src={logoPaper} alt="솥가마" />
      {storeName && (
        <h1 className="text-[15px] leading-[22px] font-normal tracking-[0.4px] text-on-brand">
          {storeName}
        </h1>
      )}
    </div>
  )
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-3 pb-[var(--layout-safe-area)] bg-canvas">{children}</div>
}

export function TableConfirmationPage({
  session,
  loading = false,
  errorMessage,
  retryable = false,
  onRetry,
  onStart,
}: TableConfirmationPageProps) {
  if (loading) {
    return (
      <div className="flex flex-col min-h-dvh bg-canvas" aria-busy="true">
        <BrandBlock />
        <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6">
          <div className="h-5 w-28 rounded-[4px] bg-surface animate-pulse motion-reduce:animate-none" />
          <div className="h-[92px] w-52 rounded-[8px] bg-surface animate-pulse motion-reduce:animate-none" />
          <div className="mt-3.5 h-[21px] w-64 max-w-full rounded-[4px] bg-surface animate-pulse motion-reduce:animate-none" />
        </main>
        <Footer>
          <Button block size="xlarge" variant="fill" label="메뉴 보기" loading />
        </Footer>
      </div>
    )
  }

  if (!session || errorMessage) {
    return (
      <div className="flex flex-col min-h-dvh bg-canvas">
        <BrandBlock />
        <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6 text-center">
          <h1 className="font-display font-normal text-[28px] leading-9 text-strong break-keep">
            테이블 정보를 불러오지 못했어요
          </h1>
          <p className="w-full text-sm leading-[21px] font-normal text-body">
            {errorMessage ?? 'QR 코드를 다시 스캔해 주세요.'}
          </p>
        </main>
        {retryable && onRetry && (
          <Footer>
            <Button
              block
              size="xlarge"
              variant="fill"
              label="다시 시도"
              onClick={onRetry}
            />
          </Footer>
        )}
      </div>
    )
  }

  const { storeName, tableNumber, notice } = session

  return (
    <div className="flex flex-col min-h-dvh bg-canvas">
      <BrandBlock storeName={storeName} />

      <main className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-6 animate-rise motion-reduce:animate-none">
        <p className="text-sm leading-5 font-medium text-muted">지금 앉아 계신 자리</p>
        <p className="flex items-baseline gap-1.5 font-display font-normal text-strong">
          <span className="text-[84px] leading-[92px]">{tableNumber}</span>
          <span className="text-[30px] leading-10">번 테이블</span>
        </p>
        <p className="mt-3.5 w-full text-sm leading-[21px] font-normal text-body text-center break-keep">
          {notice}
        </p>
      </main>

      <Footer>
        <Button block size="xlarge" variant="fill" label="메뉴 보기" onClick={onStart} />
      </Footer>
    </div>
  )
}
