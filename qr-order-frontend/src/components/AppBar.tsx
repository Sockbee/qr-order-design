export interface AppBarAction {
  label: string
  onClick: () => void
}

interface AppBarProps {
  title: string
  /** Renders the back action when provided. */
  onBack?: () => void
  /**
   * Trailing actions, rendered as outlined chips.
   *
   * These are controls, not status — DESIGN.md §7 reserves badge styling for
   * descriptive labels that are never tappable.
   */
  actions?: AppBarAction[]
  /** Filled status chip ("테이블 7"), not a control. */
  chip?: string
}

export function AppBar({ title, onBack, actions, chip }: AppBarProps) {
  return (
    <header className="sticky top-0 z-[2] bg-canvas">
      {/*
       * Safe-area spacer, not decorative padding: on notched/dynamic-island
       * phones this keeps the bar from sitting under the status bar. It's
       * part of this sticky element (not a separate scroll spacer), so it
       * stays put on scroll exactly like the bar itself.
       */}
      <div className="h-[var(--layout-safe-area-top)]" />
      <div className="flex items-center gap-2 h-16 px-4">
        {onBack && (
          <button
            type="button"
            className="relative -ml-2.5 flex-none inline-flex items-center justify-center size-11 rounded-row border-0 bg-transparent text-strong cursor-pointer transition-[background-color,transform] duration-150 ease-out-soft active:bg-surface active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:size-12 before:-translate-x-1/2 before:-translate-y-1/2"
            onClick={onBack}
            aria-label="뒤로 가기"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        <h1
          className={`flex-1 min-w-0 font-display font-normal leading-8 text-strong truncate ${
            onBack ? 'text-[22px]' : 'text-[26px]'
          }`}
        >
          {title}
        </h1>

        {chip && (
          <span className="flex-none inline-flex items-center h-7 px-2 rounded-btn-sm bg-primary text-on-primary text-[13px] leading-none font-bold tracking-[-0.2px] whitespace-nowrap">
            {chip}
          </span>
        )}

        {actions && actions.length > 0 && (
          <div className="flex items-center gap-2">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="relative inline-flex items-center h-[38px] px-2.5 rounded-btn-md border-[1.5px] border-border-strong bg-transparent text-strong font-bold text-[13px] leading-none whitespace-nowrap cursor-pointer transition-[background-color,transform] duration-150 ease-out-soft active:bg-surface active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 before:content-[''] before:absolute before:inset-x-0 before:top-1/2 before:h-12 before:-translate-y-1/2"
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
