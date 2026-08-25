import type { ReactNode } from 'react'
import './Badge.css'

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'weak'
  size?: 'xsmall' | 'small'
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'xsmall',
}: BadgeProps) {
  return <span className={`badge badge--${size} badge--${tone}`}>{children}</span>
}
