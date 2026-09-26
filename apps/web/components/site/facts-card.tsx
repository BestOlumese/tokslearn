import type { ReactNode } from 'react'

/**
 * Plain-numbers panel: the Tokslearn signature. A course (or the teaching terms) stated as facts
 * someone can hold us to, never as marketing.
 */
export function FactsCard({
  title,
  note,
  rows,
  footer,
}: {
  title: string
  /** e.g. "Example course" — says when values are illustrative. */
  note?: string
  rows: ReadonlyArray<{ label: string; value: ReactNode; detail?: ReactNode }>
  footer?: ReactNode
}) {
  return (
    <div className="rounded-dialog border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-4">
        <h2 className="text-h4 text-ink">{title}</h2>
        {note ? <span className="shrink-0 text-body-sm text-ink-3">{note}</span> : null}
      </div>
      <dl className="divide-y divide-border px-6">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-4 py-3.5">
            <dt className="text-body-sm text-ink-2">{row.label}</dt>
            <dd className="text-body-sm text-ink">
              <span className="font-semibold tabular-nums">{row.value}</span>
              {row.detail ? <span className="mt-0.5 block text-ink-2">{row.detail}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {footer ? (
        <div className="border-t border-border bg-canvas px-6 py-4 text-body-sm text-ink-2">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
