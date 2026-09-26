import type { ComponentProps } from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'brand' | 'accent' | 'info' | 'warning' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-2',
  brand: 'bg-brand-soft text-brand-ink',
  accent: 'bg-accent-soft text-accent-ink',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

/** Short status text. Max one per course card (docs/11 §4). Never the only signal of status. */
export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-caption whitespace-nowrap [&_svg]:size-3.5',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
