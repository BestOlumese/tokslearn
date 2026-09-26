import type { ReactNode } from 'react'

/** The form column on auth screens: a short title, the form, and one way out below it. */
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
    <div className="w-full max-w-[400px]">
      <h1 className="text-h1-sm text-ink">{title}</h1>
      {intro ? <p className="mt-2 text-body text-ink-2">{intro}</p> : null}
      <div className="mt-8">{children}</div>
      {footer ? (
        <div className="mt-8 border-t border-border pt-6 text-center text-body-sm text-ink-2">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
