'use client'
// Client component: copies a link and says so.

import { Button } from '@tokslearn/ui/button'
import { useState } from 'react'

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          window.prompt('Copy this link', value)
        }
      }}
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
    </Button>
  )
}
