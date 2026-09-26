import { buttonClasses } from '@tokslearn/ui/button'
import Link from 'next/link'

// Phase 0 home: honest about what exists today. The catalog home (categories, course rows,
// "Continue learning") replaces it in Phase 3 (docs/20 §1).

const promises = [
  {
    title: 'Reviewed before it goes live',
    body: 'Our team checks every course and every instructor’s identity before a course can be sold.',
  },
  {
    title: 'Refund rules shown before you pay',
    body: 'Each course states its refund window, up to 14 days, and what ends it, such as watching 30% of the lessons.',
  },
  {
    title: 'Certificates anyone can check',
    body: 'Each certificate has a code. An employer can enter it at tokslearn.com/verify to see who earned it and for which course.',
  },
] as const

export default function HomePage() {
  return (
    <div className="mx-auto max-w-page px-4 sm:px-6 lg:px-8">
      <section className="grid gap-10 pt-10 pb-10 sm:pt-16 lg:grid-cols-12 lg:gap-8 lg:pt-20 lg:pb-16">
        <div className="lg:col-span-7">
          <h1 className="text-display-sm text-ink sm:text-display">
            Courses from people who do the work, paid for in naira.
          </h1>
          <p className="mt-5 max-w-[34rem] text-body-lg text-ink-2">
            Tokslearn is a course marketplace for Nigeria. We are getting the first instructors’
            courses through review, and the catalogue opens once they pass.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/teach" className={buttonClasses()}>
              See how to apply as an instructor
            </Link>
            <Link href="/verify" className={buttonClasses({ variant: 'tertiary' })}>
              Verify a certificate
            </Link>
          </div>
        </div>

        <aside
          aria-labelledby="payments-heading"
          className="self-start rounded-card border border-border bg-surface p-6 lg:col-span-5 lg:mt-3"
        >
          <h2 id="payments-heading" className="text-h4 text-ink">
            How paying works
          </h2>
          <dl className="mt-4 divide-y divide-border text-body-sm">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-ink-2">Currency</dt>
              <dd className="font-medium text-ink">Naira (₦)</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-ink-2">Pay with</dt>
              <dd className="text-right font-medium text-ink">Card, bank transfer or USSD</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-ink-2">Processed by</dt>
              <dd className="font-medium text-ink">Paystack</dd>
            </div>
            <div className="flex justify-between gap-4 pt-3">
              <dt className="text-ink-2">Refund window</dt>
              <dd className="font-medium text-ink tabular-nums">None, 3, 7 or 14 days</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section aria-labelledby="promises-heading" className="border-t border-border pt-10 lg:pt-14">
        <h2 id="promises-heading" className="text-h2 text-ink">
          What every course on Tokslearn gives you
        </h2>
        <ul className="mt-6 max-w-[760px] divide-y divide-border border-y border-border">
          {promises.map((p) => (
            <li key={p.title} className="grid gap-1 py-5 sm:grid-cols-[16rem_1fr] sm:gap-8">
              <h3 className="text-h4 text-ink">{p.title}</h3>
              <p className="text-body text-ink-2">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
