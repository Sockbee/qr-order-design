import type { ReactNode } from 'react'
import './Badge.css'

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'weak'
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}
