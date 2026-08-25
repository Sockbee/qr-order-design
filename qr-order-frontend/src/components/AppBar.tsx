import './AppBar.css'

interface AppBarProps {
  title: string
  cartCount: number
  onCartClick?: () => void
}

export function AppBar({ title, cartCount, onCartClick }: AppBarProps) {
  return (
    <header className="app-bar">
      <h1 className="app-bar__title">{title}</h1>
      <button
        type="button"
        className="app-bar__cart"
        onClick={onCartClick}
        aria-label={`장바구니, ${cartCount}개 담김`}
      >
        <span className="app-bar__cart-chip">장바구니 {cartCount}</span>
      </button>
    </header>
  )
}
