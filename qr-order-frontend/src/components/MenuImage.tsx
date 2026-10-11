import { menuImageClassName } from '../data/menuImages'
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

/**
 * transitions.dev "skeleton reveal": the surface tile is the placeholder, and
 * the artwork resolves in through a short blur once it has loaded. An image
 * already in cache when it mounts shows at once instead of fading every visit.
 */
const IMAGE_STATE_CLASSES = {
  pending: 'opacity-0 blur-[2px]',
  loaded:
    'transition-[opacity,filter] duration-(--motion-duration-slow) ease-out-soft motion-reduce:transition-none',
  cached: '',
} as const

function MenuImageContent({ src, className = '', loading = 'lazy' }: MenuImageProps) {
  const [failed, setFailed] = useState(false)
  const [state, setState] = useState<keyof typeof IMAGE_STATE_CLASSES>('pending')

  return (
    <span className={`flex items-center justify-center overflow-hidden bg-surface ${className}`} aria-hidden="true">
      {src && !failed ? (
        <img
          ref={(image) => {
            // Runs on every render; only the first, still-pending one decides.
            if (image?.complete && image.naturalWidth > 0) {
              setState((current) => (current === 'pending' ? 'cached' : current))
            }
          }}
          className={`${menuImageClassName(src)} ${IMAGE_STATE_CLASSES[state]}`}
          src={src}
          alt=""
          loading={loading}
          decoding="async"
          onLoad={() => setState((current) => (current === 'pending' ? 'loaded' : current))}
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
