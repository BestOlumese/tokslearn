import type { ReactNode } from 'react'

export function Section({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 border-t border-border py-10"
    >
      <h2 id={`${id}-title`} className="text-h2 text-ink">
        {title}
      </h2>
      {note ? <p className="mt-1 max-w-prose text-body-sm text-ink-2">{note}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}
