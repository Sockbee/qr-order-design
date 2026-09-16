import { useState } from 'react'

interface MenuImageProps {
  src?: string
  className?: string
  loading?: 'lazy' | 'eager'
}

/** Decorative artwork: the adjacent menu name provides the accessible label. */
export function MenuImage(props: MenuImageProps) {
  return <MenuImageContent key={props.src ?? 'empty'} {...props} />
}

function MenuImageContent({ src, className = '', loading = 'lazy' }: MenuImageProps) {
  const [failed, setFailed] = useState(false)

  return (
    <span className={`flex items-center justify-center overflow-hidden bg-surface ${className}`} aria-hidden="true">
      {src && !failed ? (
        <img
          className="block w-full h-full object-contain p-2"
          src={src}
          alt=""
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg className="size-8 text-muted" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="16" cy="16" r="9" />
          <circle cx="16" cy="16" r="5" />
          <path d="M3 5v8m-2-8v5a2 2 0 0 0 4 0V5M3 13v14M29 5v22m0-22c-3 3-3 9 0 10" />
        </svg>
      )}
    </span>
  )
}
