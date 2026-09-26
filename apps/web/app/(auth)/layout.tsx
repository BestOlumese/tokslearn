import type { ReactNode } from 'react'
import { AuthInfoPanel } from '@/components/auth/auth-info-panel'
import { Wordmark } from '@/components/wordmark'

// Focused frame for sign-in and account recovery (Udemy-style): visual on the left, the form on
// the right, no site navigation or footer to distract.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-2">
      <AuthInfoPanel />
      <div className="flex flex-col">
        <header className="flex h-[68px] items-center justify-between border-b border-border px-4 sm:px-8 lg:border-0">
          <Wordmark plain />
          <a
            href="/"
            className="inline-flex min-h-11 items-center text-body-sm font-medium text-brand-ink hover:underline"
          >
            Back to Tokslearn
          </a>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 justify-center px-4 pt-8 pb-12 focus:outline-none sm:items-center sm:px-8"
        >
          {children}
        </main>
        <p className="px-4 pb-6 text-center text-body-sm text-ink-3 sm:px-8">
          Can't get in? Email support@tokslearn.com
        </p>
      </div>
    </div>
  )
}
