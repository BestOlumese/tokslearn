import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BundleBuy } from '@/components/catalog/bundle-buy'
import { CourseCover } from '@/components/catalog/course-cover'
import { refundLine } from '@/components/catalog/purchase-panel'
import { getBundle } from '@/lib/catalog-data'
import { formatNaira } from '@/lib/format'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return [{ slug: '__none__' }]
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const b = await getBundle((await params).slug)
  if (!b) return { title: 'Bundle' }
  return {
    title: `${b.title}, a bundle by ${b.instructorName}`.slice(0, 60),
    description: `${b.courses.length} courses for ${formatNaira(b.priceKobo)} instead of ${formatNaira(b.valueKobo)}.`,
    alternates: { canonical: `/bundles/${b.slug}` },
  }
}

// docs/20 `/bundles/[slug]`: title, included courses, total value vs bundle price, purchase panel.
export default function BundlePage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto mt-10 h-96 max-w-catalog animate-pulse rounded-card bg-surface-sunken" />
      }
    >
      <Bundle params={params} />
    </Suspense>
  )
}

async function Bundle({ params }: { params: Params }) {
  const b = await getBundle((await params).slug)
  if (!b) notFound()
  const saving = BigInt(b.valueKobo) - BigInt(b.priceKobo)
  return (
    <div className="mx-auto grid max-w-catalog gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-brand-ink">
          Bundle · {b.courses.length} courses
        </p>
        <h1 className="mt-1 text-h1-sm text-ink sm:text-h1">{b.title}</h1>
        <p className="mt-2 text-body text-ink-2">By {b.instructorName}</p>
        {b.description ? (
          <p className="mt-4 max-w-prose whitespace-pre-line text-body text-ink-2">
            {b.description}
          </p>
        ) : null}
        <h2 className="mt-10 text-h2 text-ink">What's included</h2>
        <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-surface">
          {b.courses.map((c) => (
            <li key={c.id} className="flex items-center gap-4 p-4">
              <CourseCover
                src={c.coverUrl}
                alt={c.title}
                sizes="160px"
                className="w-28 shrink-0 sm:w-40"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/courses/${c.slug}` as Route}
                  className="line-clamp-2 text-body font-semibold text-ink hover:text-brand-ink hover:underline"
                >
                  {c.title}
                </Link>
                <p className="mt-0.5 text-body-sm text-ink-2">{refundLine(c.refundPolicyDays)}</p>
              </div>
              <p className="shrink-0 text-body-sm text-ink-2">
                <span className="sr-only">On its own: </span>
                {formatNaira(c.priceKobo)}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <aside aria-label="Buy this bundle" className="lg:pt-8">
        <div className="sticky top-24 flex flex-col gap-4 rounded-dialog border border-border bg-surface p-6">
          <p>
            <span className="text-h1-sm text-ink">{formatNaira(b.priceKobo)}</span>
            <span className="ml-2 text-body-sm text-ink-3 line-through">
              <span className="sr-only">Separately </span>
              {formatNaira(b.valueKobo)}
            </span>
          </p>
          {saving > 0n ? (
            <p className="text-body-sm text-ink">
              You save {formatNaira(saving)} against buying each course.
            </p>
          ) : null}
          <BundleBuy bundleId={b.id} />
          <p className="text-body-sm text-ink-2">
            Each course keeps its own refund rule, listed next to it.
          </p>
        </div>
      </aside>
    </div>
  )
}
