import { buttonClasses } from '@tokslearn/ui/button'
import Link from 'next/link'
import { SearchIcon } from '@/components/icons/search-icon'
import { TopicGrid } from '@/components/site/topic-grid'
import { VerifyForm } from '@/components/site/verify-form'
import { exampleSearches } from '@/lib/topics'

// Pre-launch home. The catalogue home (categories, course rows, "Continue learning") replaces the
// middle sections in Phase 3 (docs/20 §1). The topic panel becomes the real category list then.

export default function HomePage() {
  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-catalog gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:px-8 lg:pt-20 lg:pb-24">
          <div>
            <h1 className="max-w-[16ch] text-display-sm text-ink sm:text-display">
              Online courses from Nigerian instructors
            </h1>
            <p className="mt-5 max-w-[34rem] text-body-lg text-ink-2">
              Excel, programming, design, marketing and more. Pay in naira by card, bank transfer or
              USSD, then watch the lessons on your phone or laptop.
            </p>
            <search className="mt-8 max-w-[560px]">
              <form action="/courses" className="flex gap-2">
                <label htmlFor="hero-search" className="sr-only">
                  Search for a course
                </label>
                <div className="relative flex-1">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-3" />
                  <input
                    id="hero-search"
                    name="q"
                    type="search"
                    maxLength={100}
                    placeholder="Search courses"
                    className="h-14 w-full rounded-control border border-border-strong bg-surface pr-4 pl-12 text-body text-ink placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  />
                </div>
                <button
                  type="submit"
                  className={buttonClasses({ size: 'lg', className: 'h-14 px-7' })}
                >
                  Search
                </button>
              </form>
            </search>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-body-sm text-ink-3">
              <span>Try:</span>
              {exampleSearches.map((term) => (
                <Link
                  key={term}
                  href={`/courses?q=${encodeURIComponent(term)}`}
                  className="inline-flex h-11 items-center rounded-full border border-border px-4 text-ink-2 hover:border-ink-3 hover:text-ink sm:h-9"
                >
                  {term}
                </Link>
              ))}
            </p>
          </div>

          <TopicGrid />
        </div>
      </section>

      <section
        aria-labelledby="audience-title"
        className="mx-auto max-w-catalog px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20"
      >
        <h2 id="audience-title" className="sr-only">
          Learn or teach on Tokslearn
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col rounded-dialog border border-border bg-surface p-7 sm:p-9">
            <h3 className="text-h2 text-ink">Learn on Tokslearn</h3>
            <p className="mt-3 text-body text-ink-2">
              Pay once per course and keep access. If a course isn’t right for you, the refund rules
              on its page tell you exactly how long you have.
            </p>
            <p className="mt-3 text-body text-ink-2">
              When you finish, your certificate gets a code any employer can check.
            </p>
            <div className="mt-auto pt-7">
              <Link href="/sign-up" className={buttonClasses({ variant: 'secondary' })}>
                Create a free account
              </Link>
            </div>
          </div>
          <div className="flex flex-col rounded-dialog border border-border bg-surface p-7 sm:p-9">
            <h3 className="text-h2 text-ink">Teach on Tokslearn</h3>
            <p className="mt-3 text-body text-ink-2">
              Keep 97% of sales that come from your own links and coupons, and at least half of the
              sales we bring you. You set the price.
            </p>
            <p className="mt-3 text-body text-ink-2">
              We pay out monthly on the 5th, straight to your Nigerian bank account.
            </p>
            <div className="mt-auto pt-7">
              <Link href="/teach" className={buttonClasses({ variant: 'secondary' })}>
                See how teaching works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="verify-title"
        className="mx-auto max-w-catalog px-4 pt-6 sm:px-6 lg:px-8"
      >
        <div className="flex flex-col gap-6 rounded-dialog bg-brand-soft p-7 sm:p-9 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-md">
            <h2 id="verify-title" className="text-h3 text-brand-ink">
              Checking someone’s certificate?
            </h2>
            <p className="mt-1 text-body text-ink-2">
              Enter the code printed on it to see who earned it and for which course.
            </p>
          </div>
          <VerifyForm id="home-verify" compact />
        </div>
      </section>
    </>
  )
}
