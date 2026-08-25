import './AppBar.css'

export interface AppBarAction {
  label: string
  onClick: () => void
}

interface AppBarProps {
  title: string
  /** Renders the back action when provided. */
  onBack?: () => void
  /**
   * Trailing actions, rendered as bordered buttons.
   *
   * These are controls, not status — DESIGN.md §7 reserves badge styling for
   * descriptive labels that are never tappable.
   */
  actions?: AppBarAction[]
}

export function AppBar({ title, onBack, actions }: AppBarProps) {
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

      {actions && actions.length > 0 && (
        <div className="app-bar__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="app-bar__action"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
