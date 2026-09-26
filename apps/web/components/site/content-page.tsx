import type { ReactNode } from 'react'
import { PageHeader } from './page-header'
import { Prose } from './prose'

/** Page header band + readable body, for help and policy pages. */
export function ContentPage({
  title,
  description,
  updated,
  children,
}: {
  title: string
  description?: ReactNode
  updated?: string
  children: ReactNode
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        {updated ? <p className="mb-8 text-body-sm text-ink-3">{updated}</p> : null}
        <Prose>{children}</Prose>
      </div>
    </>
  )
}
