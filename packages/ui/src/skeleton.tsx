import type { ComponentProps } from 'react'
import { cn } from './cn'

const shapes = { rect: 'rounded-control', pill: 'rounded-full' } as const

/** Match the final layout exactly so streamed content causes no shift (docs/11 §4). */
export function Skeleton({
  shape = 'rect',
  className,
  ...props
}: ComponentProps<'div'> & { shape?: keyof typeof shapes }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse bg-surface-sunken', shapes[shape], className)}
      {...props}
    />
  )
}
