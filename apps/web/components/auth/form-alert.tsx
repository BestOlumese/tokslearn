import type { ReactNode } from 'react'

const tones = {
  error:
    'rounded-control border-l-4 border-danger bg-danger-soft px-3 py-2.5 text-body-sm text-danger',
  success:
    'rounded-control border-l-4 border-brand bg-success-soft px-3 py-2.5 text-body-sm text-brand-ink',
  info: 'rounded-control border-l-4 border-info bg-info-soft px-3 py-2.5 text-body-sm text-ink',
} as const

/**
 * Form-level message. Errors are announced to screen readers; successes and notes politely. The
 * wording says what happened, so colour is never the only signal (docs/11 §8).
 */
export function FormAlert({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={tones[tone]}>
      {children}
    </div>
  )
}
