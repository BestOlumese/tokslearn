import type { ReactNode } from 'react'

// Left panel of the auth screens on large displays: how buying and learning works, in four
// plain steps (docs/01, docs/07 §5). Icons are inline SVG so the auth bundle stays in budget.

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        {children}
      </svg>
    </span>
  )
}

const steps = [
  {
    title: 'Find a course',
    body: 'Each course page shows the price, the lessons and the refund rules before you pay.',
    icon: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
  {
    title: 'Pay in naira',
    body: 'Card, bank transfer or USSD. You pay once and the course stays in your account.',
    icon: (
      <>
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
  },
  {
    title: 'Learn on your phone or laptop',
    body: 'Watch at your own pace. We remember where you stopped.',
    icon: (
      <>
        <rect width="14" height="20" x="5" y="2" rx="2" />
        <path d="M12 18h.01" />
      </>
    ),
  },
  {
    title: 'Get your certificate',
    body: 'It has a code printed on it, so an employer can check it on Tokslearn.',
    icon: (
      <>
        <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" />
        <circle cx="12" cy="8" r="6" />
      </>
    ),
  },
] as const

export function AuthInfoPanel() {
  return (
    <aside
      aria-labelledby="auth-info-title"
      className="hidden bg-brand-soft lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-20"
    >
      <div className="max-w-120">
        <h2 id="auth-info-title" className="text-h2 text-brand-ink">
          How Tokslearn works
        </h2>
        <ol className="mt-8 divide-y divide-border overflow-hidden rounded-dialog border border-border bg-surface">
          {steps.map((step) => (
            <li key={step.title} className="flex gap-4 px-6 py-5">
              <Icon>{step.icon}</Icon>
              <div>
                <h3 className="text-body font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-body-sm text-ink-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-body-sm text-ink-2">
          Questions before you start?{' '}
          <a href="/help" className="font-medium text-brand-ink underline underline-offset-4">
            Read the help page
          </a>
        </p>
      </div>
    </aside>
  )
}
