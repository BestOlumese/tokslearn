import type { ReactNode } from 'react'

/** Title row for back-office pages: what this is, one line of context, actions on the right. */
export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-h1-sm text-ink">{title}</h1>
        {description ? <p className="mt-1 text-body text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  )
}
