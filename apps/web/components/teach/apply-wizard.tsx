'use client'
// Client component: the /teach/apply steps (docs/20). Progress is saved per step on the server.

import type { MyApplicationDto } from '@tokslearn/contract'
import { cn } from '@tokslearn/ui/cn'
import { Progress } from '@tokslearn/ui/progress'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AboutStep } from './about-step'
import { ApplicationStatus } from './application-status'
import { BankStep } from './bank-step'
import { ExpertiseStep } from './expertise-step'
import { IdentityStep } from './identity-step'
import { ReviewStep } from './review-step'

const steps = ['About you', 'Expertise and sample', 'Identity', 'Bank account', 'Review and submit']

function doneSteps(state: MyApplicationDto): boolean[] {
  const gaps = state.application?.gaps
  const draft = state.application?.status === 'draft'
  return [
    draft && !gaps?.includes('about'),
    draft && !gaps?.includes('expertise'),
    state.kyc?.status === 'verified' || state.kyc?.status === 'manual_review',
    Boolean(state.payoutAccount),
    false,
  ]
}

export function ApplyWizard({ initial }: { initial: MyApplicationDto }) {
  const router = useRouter()
  const [state, setState] = useState(initial)
  const done = doneSteps(state)
  const [current, setCurrent] = useState(() => {
    const first = doneSteps(initial).findIndex((d) => !d)
    return first === -1 ? steps.length - 1 : first
  })

  const status = state.application?.status
  const locked =
    status === 'submitted' ||
    status === 'in_review' ||
    (status === 'rejected' && Boolean(state.canReapplyAt))

  const goTo = (step: number) => {
    setCurrent(step)
    requestAnimationFrame(() => {
      const el = document.getElementById('apply-step')
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'start' })
    })
  }
  const saved = (next: MyApplicationDto, advance = true) => {
    setState(next)
    if (next.isInstructor) router.replace('/teach/courses')
    else if (advance) goTo(Math.min(current + 1, steps.length - 1))
  }

  if (locked) {
    return (
      <div className="max-w-[780px]">
        <ApplicationStatus state={state} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-body-sm text-ink-2">
            Step {current + 1} of {steps.length} ·{' '}
            <span className="font-medium text-ink">{steps[current]}</span>
          </p>
          {current > 0 ? (
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              className="min-h-11 text-body-sm font-medium text-brand-ink underline-offset-4 hover:underline"
            >
              Back
            </button>
          ) : null}
        </div>
        <Progress
          value={((current + 1) / steps.length) * 100}
          label="Application progress"
          showValue={false}
        />
      </div>
      <nav aria-label="Application steps" className="hidden md:block">
        <ol className="flex flex-col gap-1">
          {steps.map((label, i) => (
            <li key={label} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === current ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-body-sm',
                  i === current
                    ? 'bg-brand-soft font-medium text-brand-ink'
                    : 'text-ink-2 hover:bg-surface-sunken hover:text-ink',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] tabular-nums',
                    done[i]
                      ? 'border-brand bg-brand text-ink-inverse'
                      : 'border-border-strong bg-surface',
                  )}
                >
                  {done[i] ? <Check aria-hidden className="size-3.5" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="whitespace-nowrap">
                  {label}
                  {done[i] ? <span className="sr-only"> (done)</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div
        id="apply-step"
        tabIndex={-1}
        className="flex max-w-[780px] scroll-mt-24 flex-col gap-6 focus:outline-none"
      >
        {status === 'rejected' ? (
          <p className="rounded-control border border-border bg-surface px-4 py-3 text-body-sm text-ink-2">
            Your last application wasn't approved. Your earlier answers are filled in; update them
            and submit again.
          </p>
        ) : null}
        {current === 0 ? <AboutStep state={state} onSaved={saved} /> : null}
        {current === 1 ? <ExpertiseStep state={state} onSaved={saved} /> : null}
        {current === 2 ? (
          <IdentityStep
            state={state}
            onSaved={(next) => saved(next, false)}
            onContinue={() => goTo(3)}
          />
        ) : null}
        {current === 3 ? (
          <BankStep
            state={state}
            onSaved={(next) => saved(next, false)}
            onContinue={() => goTo(4)}
            onVerifyIdentity={() => goTo(2)}
          />
        ) : null}
        {current === 4 ? (
          <ReviewStep state={state} onSaved={(next) => saved(next, false)} goTo={goTo} />
        ) : null}
      </div>
    </div>
  )
}
