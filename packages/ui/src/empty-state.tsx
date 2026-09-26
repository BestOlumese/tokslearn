import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * One sentence saying what goes here, plus one action (docs/11 §4, docs/20 §0).
 * No illustrations.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  headingLevel = 2,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  headingLevel?: 1 | 2 | 3
}) {
  const Heading = `h${headingLevel}` as const
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-card border border-dashed border-border-strong bg-surface p-6 sm:p-8',
        className,
      )}
    >
      <Heading className="text-h4 text-ink">{title}</Heading>
      {description ? <p className="max-w-prose text-body text-ink-2">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
