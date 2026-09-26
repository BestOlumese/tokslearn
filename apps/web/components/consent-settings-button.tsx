'use client'
// Client component: reopens the consent banner so visitors can change their choice.

import { reopenConsent } from '@/lib/consent'

export function ConsentSettingsButton({
  className = 'inline-flex min-h-11 items-center text-body-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline',
}: {
  className?: string
}) {
  return (
    <button type="button" onClick={reopenConsent} className={className}>
      Change my analytics choice
    </button>
  )
}
