import { buttonClasses } from '@tokslearn/ui/button'
import type { Route } from 'next'
import Link from 'next/link'
import { type RawParams, withParams } from '@/lib/catalog-params'

/** Cursor pages as links (docs/05 §3.1); "Back to the start" when not on the first page. */
export function Pager({
  path,
  params,
  nextCursor,
}: {
  path: string
  params: RawParams
  nextCursor: string | null
}) {
  const onFirst = !params.cursor
  if (onFirst && !nextCursor) return null
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3">
      {nextCursor ? (
        <Link
          href={`${path}${withParams(params, { cursor: nextCursor })}` as Route}
          className={buttonClasses({ variant: 'secondary' })}
        >
          More courses
        </Link>
      ) : null}
      {!onFirst ? (
        <Link
          href={`${path}${withParams(params, { cursor: null })}` as Route}
          className="text-body-sm font-medium text-brand-ink underline-offset-4 hover:underline"
        >
          Back to the start
        </Link>
      ) : null}
    </div>
  )
}
