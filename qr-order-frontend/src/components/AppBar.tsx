import './AppBar.css'

interface AppBarProps {
  title: string
  /** Renders the back action when provided. */
  onBack?: () => void
  /** Renders the cart chip when provided. */
  cartCount?: number
  onCartClick?: () => void
}

export function AppBar({
  title,
  onBack,
  cartCount,
  onCartClick,
}: AppBarProps) {
  return (
    <header className="app-bar">
      {onBack && (
        <button
          type="button"
          className="app-bar__back"
          onClick={onBack}
          aria-label="뒤로 가기"
        >
          ←
        </button>
      )}

      <h1 className="app-bar__title">{title}</h1>

      {cartCount !== undefined && (
        <button
          type="button"
          className="app-bar__cart"
          onClick={onCartClick}
          aria-label={`장바구니, ${cartCount}개 담김`}
        >
          <span className="app-bar__cart-chip">장바구니 {cartCount}</span>
        </button>
      )}
    </header>
  )
}
