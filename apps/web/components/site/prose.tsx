import type { ReactNode } from 'react'

/** Readable long text (docs/11 §2: 68ch, body-lg, clear heading spacing). */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-prose text-body-lg text-ink-2 [&_a]:text-brand-ink [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-h3 [&_h2]:text-ink [&_h2:first-child]:mt-0 [&_li]:mt-2 [&_p]:mt-4 [&_p:first-child]:mt-0 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </div>
  )
}
