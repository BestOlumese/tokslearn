import type { ReactNode } from 'react'

/**
 * Form-level message. Errors are announced to screen readers; successes politely. The wording
 * says what happened, so colour is never the only signal (docs/11 §8).
 */
export function FormAlert({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-control border-l-4 border-danger bg-danger-soft px-3 py-2.5 text-body-sm text-danger'
          : 'rounded-control border-l-4 border-brand bg-success-soft px-3 py-2.5 text-body-sm text-brand-ink'
      }
    >
      {children}
    </div>
  )
}
