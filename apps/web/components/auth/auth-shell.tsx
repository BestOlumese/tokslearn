import type { ReactNode } from 'react'

/** Single-column auth layout, max 560 px, left-aligned (docs/11 §5 Forms). */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-page px-4 pt-10 pb-6 sm:px-6 sm:pt-16 lg:px-8">
      <div className="max-w-[440px]">
        <h1 className="text-h1-sm text-ink sm:text-h1">{title}</h1>
        {intro ? <p className="mt-2 text-body text-ink-2">{intro}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? (
          <div className="mt-8 border-t border-border pt-6 text-body-sm text-ink-2">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
