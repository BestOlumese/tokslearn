import type { ReactNode } from 'react'

/**
 * White band that opens a page: title, one line of context, optional actions on the right.
 * Gives every page the same top edge instead of a heading floating on the canvas.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  width = 'page',
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** Small context line above the title, e.g. a breadcrumb link. Sentence case, not a label. */
  eyebrow?: ReactNode
  width?: 'page' | 'catalog'
  children?: ReactNode
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div
        className={`mx-auto px-4 py-8 sm:px-6 sm:py-10 lg:px-8 ${width === 'catalog' ? 'max-w-catalog' : 'max-w-page'}`}
      >
        {eyebrow ? <div className="mb-2 text-body-sm text-ink-2">{eyebrow}</div> : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[46rem]">
            <h1 className="text-h1-sm text-ink sm:text-h1">{title}</h1>
            {description ? <p className="mt-2 text-body-lg text-ink-2">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  )
}
