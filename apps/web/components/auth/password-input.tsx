'use client'
// Client component: toggles password visibility. A text toggle keeps icon code off the auth pages.

import { controlClasses } from '@tokslearn/ui/input'
import { type ComponentProps, useState } from 'react'

export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type' | 'className'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        className={`${controlClasses} h-10 pr-16`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute top-0 right-0 inline-flex h-10 min-w-14 items-center justify-center rounded-control px-3 text-body-sm font-medium text-brand-ink hover:bg-brand-soft"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
