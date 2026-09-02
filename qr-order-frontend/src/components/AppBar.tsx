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
    <header className="sticky top-0 z-[2] flex items-center gap-2 h-14 px-4 bg-canvas">
      {onBack && (
        <button
          type="button"
          className="relative inline-flex items-center justify-center w-[22px] h-[33px] p-0 border-0 bg-transparent font-bold text-[22px] leading-[33px] text-strong cursor-pointer before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:w-12 before:h-12 before:-translate-x-1/2 before:-translate-y-1/2"
          onClick={onBack}
          aria-label="뒤로 가기"
        >
          ←
        </button>
      )}

      <h1 className="flex-1 min-w-0 font-bold text-base leading-6 text-strong truncate">
        {title}
      </h1>

      {actions && actions.length > 0 && (
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="relative inline-flex items-center h-11 px-3 border border-border-default rounded-btn-sm bg-canvas text-strong font-bold text-sm leading-[21px] whitespace-nowrap cursor-pointer transition-colors duration-150 ease-out motion-reduce:transition-none active:bg-surface before:content-[''] before:absolute before:top-1/2 before:left-0 before:right-0 before:h-12 before:-translate-y-1/2"
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
