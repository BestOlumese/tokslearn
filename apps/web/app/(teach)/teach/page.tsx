import { buttonClasses } from '@tokslearn/ui/button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tokslearn/ui/table'
import type { Metadata } from 'next'
import Link from 'next/link'
import { FactsCard } from '@/components/site/facts-card'
import { PageHeader } from '@/components/site/page-header'

export const metadata: Metadata = {
  title: 'Teach on Tokslearn',
  description:
    'Sell your course to Nigerian learners. Keep 97% of sales from your own links, get paid monthly in naira.',
}

// docs/20 §1 `/teach`. Numbers come from ADR-017 (commission), ADR-019 (payouts), ADR-004/018
// (refunds). Applications open in Phase 2, so the call to action is an account for now.

const steps = [
  ['Apply', 'Tell us what you teach and share a sample: a video, a class recording or an article.'],
  [
    'Verify your identity',
    'Confirm who you are with your BVN or NIN and a selfie. We keep the result, never the number.',
  ],
  [
    'Build your course',
    'Upload videos, write lessons, add quizzes and set your price and refund window.',
  ],
  ['Pass review', 'Our team checks the course against the content policy before it can be sold.'],
  [
    'Publish and get paid',
    'Your course goes live. Earnings arrive in your bank account every month.',
  ],
] as const

const shares = [
  ['Your own link or coupon', 'You bring the learner', '97%'],
  ['Tokslearn search and browsing', 'The learner finds you on Tokslearn', '60%'],
  ['Tokslearn paid ads', 'We pay to bring the learner', '50%'],
] as const

export default function TeachPage() {
  return (
    <>
      <PageHeader
        title="Teach on Tokslearn"
        description="Turn what you know into a course people in Nigeria can buy in naira. You set the price; we handle payments, video and certificates."
        width="catalog"
        actions={
          <Link href="/teach/apply" className={buttonClasses({ size: 'lg' })}>
            Apply to teach
          </Link>
        }
      />
      <div className="mx-auto grid max-w-catalog gap-12 px-4 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16 lg:px-8">
        <div className="flex min-w-0 flex-col gap-14">
          <section aria-labelledby="how-title">
            <h2 id="how-title" className="text-h2 text-ink">
              How it works
            </h2>
            <ol className="mt-6 flex flex-col">
              {steps.map(([title, body], i) => (
                <li key={title} className="relative flex gap-5 pb-7 last:pb-0">
                  {i < steps.length - 1 ? (
                    <span
                      aria-hidden
                      className="absolute top-9 left-[17px] h-[calc(100%-2.25rem)] w-px bg-border-strong"
                    />
                  ) : null}
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-body-sm font-semibold text-ink tabular-nums">
                    {i + 1}
                  </span>
                  <div className="pt-1.5">
                    <h3 className="text-h4 text-ink">{title}</h3>
                    <p className="mt-1 text-body text-ink-2">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-body-sm text-ink-3">
              Applying takes about 15 minutes. Have your BVN or NIN, a phone or laptop camera, and
              your bank account number ready.
            </p>
          </section>

          <section id="earnings" aria-labelledby="earnings-title" className="scroll-mt-24">
            <h2 id="earnings-title" className="text-h2 text-ink">
              What you earn
            </h2>
            <p className="mt-2 max-w-prose text-body text-ink-2">
              Your share depends on who brought the learner. The rate at the time of the sale is
              saved with the order, so later changes never touch money you've already earned.
            </p>
            <div className="mt-5">
              <Table>
                <TableCaption>Instructor share by where the sale came from</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale came from</TableHead>
                    <TableHead className="hidden sm:table-cell">Meaning</TableHead>
                    <TableHead className="text-right">You keep</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shares.map(([source, meaning, share]) => (
                    <TableRow key={source}>
                      <TableCell className="font-medium">{source}</TableCell>
                      <TableCell className="hidden text-ink-2 sm:table-cell">{meaning}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {share}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-body-sm text-ink-3">
              Example: a ₦10,000 course sold through your own link pays you ₦9,700.
            </p>
          </section>

          <section aria-labelledby="refunds-title">
            <h2 id="refunds-title" className="text-h2 text-ink">
              Refunds
            </h2>
            <p className="mt-2 max-w-prose text-body text-ink-2">
              You choose a refund window for each course: none, 3, 7 or 14 days. A learner can't get
              a refund once they've watched more than 30% of the course, downloaded a resource you
              marked as important, received the certificate or started the final exam.
            </p>
            <p className="mt-3 max-w-prose text-body text-ink-2">
              Your balance never goes below zero because of a refund. Payment fees lost on refunds
              are ours to cover.
            </p>
          </section>

          <section id="payouts" aria-labelledby="payouts-title" className="scroll-mt-24">
            <h2 id="payouts-title" className="text-h2 text-ink">
              Payouts
            </h2>
            <p className="mt-2 max-w-prose text-body text-ink-2">
              Money from a sale becomes available once its refund window closes. On the 5th of each
              month we send your available balance to your Nigerian bank account through Paystack,
              as long as it's at least ₦5,000. Smaller balances roll over to the next month.
            </p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <FactsCard
            title="Teaching at a glance"
            rows={[
              { label: 'Your own sales', value: '97% to you' },
              { label: 'Sales we bring', value: '50–60% to you' },
              { label: 'Price', value: 'You decide', detail: 'Free courses are allowed' },
              { label: 'Payout day', value: 'The 5th', detail: 'Monthly, by bank transfer' },
              { label: 'Minimum payout', value: '₦5,000' },
              { label: 'You need', value: 'BVN or NIN', detail: 'and two-factor sign-in' },
            ]}
            footer={
              <Link
                href="/teach/apply"
                className="font-medium text-brand-ink underline underline-offset-4"
              >
                Apply to teach
              </Link>
            }
          />
        </aside>
      </div>
    </>
  )
}
