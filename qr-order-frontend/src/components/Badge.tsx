import type { ReactNode } from 'react'

const SIZE_CLASSES = {
  xsmall: 'h-5 px-1.5 rounded-[4px]',
  small: 'h-[22px] px-2 rounded-[6px]',
  medium: 'h-7 px-3 rounded-btn-sm',
} as const

const TONE_CLASSES = {
  neutral: 'bg-surface text-body',
  weak: 'bg-primary text-on-primary',
  outline: 'border border-border-default bg-transparent text-body',
} as const

interface BadgeProps {
  children: ReactNode
  tone?: keyof typeof TONE_CLASSES
  size?: keyof typeof SIZE_CLASSES
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'xsmall',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex flex-none items-center text-[12px] leading-none font-bold whitespace-nowrap ${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
