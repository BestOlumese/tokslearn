import type { ReactNode } from 'react'

/**
 * One settings section: title and a line of explanation, the content, and an optional footer
 * strip for its action. `danger` marks irreversible actions (account deletion).
 */
export function SettingsPanel({
  id,
  title,
  description,
  children,
  footer,
  tone = 'default',
}: {
  id: string
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`overflow-hidden rounded-card border bg-surface ${tone === 'danger' ? 'border-danger/40' : 'border-border'}`}
    >
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2
          id={`${id}-title`}
          className={`text-h3 ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-prose text-body-sm text-ink-2">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="px-5 pt-5 pb-6 sm:px-6">{children}</div>
      ) : (
        <div className="pb-5" />
      )}
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-canvas px-5 py-3.5 sm:px-6">
          {footer}
        </div>
      ) : null}
    </section>
  )
}
