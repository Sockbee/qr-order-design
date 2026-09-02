import type { ReactNode } from 'react'

const SIZE_CLASSES = {
  xsmall: 'py-0.5 px-1.5 rounded-[4px]',
  small: 'py-[3px] px-2 rounded-[4px]',
  medium: 'py-1.5 px-3 rounded-btn-sm',
} as const

const TONE_CLASSES = {
  neutral: 'bg-surface text-body',
  weak: 'bg-weak text-link',
} as const

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'weak'
  size?: 'xsmall' | 'small' | 'medium'
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'xsmall',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center text-[12px] leading-[18px] font-normal whitespace-nowrap ${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
