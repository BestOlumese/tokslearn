import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import { CourseGrid } from '@/components/catalog/course-grid'
import { Track } from '@/components/catalog/track'
import { JsonLd } from '@/components/seo/json-ld'
import { env } from '@/env'
import { getInstructor, topInstructorSlugs } from '@/lib/catalog-data'

type Params = Promise<{ slug: string }>

const linkLabel: Readonly<Record<string, string>> = {
  website: 'Website',
  linkedin: 'LinkedIn',
  x: 'X',
  youtube: 'YouTube',
  github: 'GitHub',
  other: 'Link',
}

/** Prerender instructors with live courses; new ones render on first visit and stay cached. */
export async function generateStaticParams() {
  const slugs = await topInstructorSlugs()
  // Cache Components needs at least one param; an empty catalog renders it as not found.
  return (slugs.length > 0 ? slugs : ['__none__']).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const result = await getInstructor(slug)
  if (result.kind !== 'instructor') return { title: 'Instructor' }
  const i = result.instructor
  const description = (
    i.headline ?? `${i.name} teaches ${i.courseCount} courses on Tokslearn.`
  ).slice(0, 155)
  return {
    title: `${i.name}, instructor`,
    description,
    alternates: { canonical: `/instructors/${i.slug}` },
    openGraph: { type: 'profile', title: i.name, description, url: `/instructors/${i.slug}` },
  }
}

// docs/20 §1 `/instructors/[slug]`. Reviews summary joins with reviews (Phase 9).
export default function InstructorPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<InstructorSkeleton />}>
      <Instructor params={params} />
    </Suspense>
  )
}

/** Mirrors the header band and grid below so streaming in the profile doesn't move the page. */
function InstructorSkeleton() {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-catalog flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:px-6 lg:px-8">
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <div className="w-full max-w-[46rem]">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-2 h-10 w-64 max-w-full" />
            <Skeleton className="mt-3 h-6 w-96 max-w-full" />
            <Skeleton className="mt-5 h-12 w-24" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-catalog px-4 pt-10 pb-16 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-72 max-w-full" />
        <div className="mt-6 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-video rounded-card" />
          ))}
        </div>
      </div>
    </>
  )
}

async function Instructor({ params }: { params: Params }) {
  const { slug } = await params
  const result = await getInstructor(slug)
  if (result.kind === 'redirect') permanentRedirect(`/instructors/${result.slug}` as Route)
  if (result.kind === 'missing') notFound()
  const i = result.instructor
  const site = env.NEXT_PUBLIC_APP_URL
  const stats: Array<[string, string]> = [
    [String(i.courseCount), i.courseCount === 1 ? 'course' : 'courses'],
    ...(i.learnerCount > 0
      ? [[i.learnerCount.toLocaleString('en-NG'), 'learners'] as [string, string]]
      : []),
    ...(i.ratingAvg !== null && i.ratingCount >= 3
      ? [[i.ratingAvg.toFixed(1), `average from ${i.ratingCount} ratings`] as [string, string]]
      : []),
  ]

  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-catalog flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:px-6 lg:px-8">
          {i.avatarUrl ? (
            // biome-ignore lint/performance/noImgElement: fixed 96px photo, no optimizer needed
            <img
              src={i.avatarUrl}
              alt=""
              width={96}
              height={96}
              className="size-24 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-24 shrink-0 items-center justify-center rounded-full bg-brand-soft text-h2 text-brand-ink"
            >
              {i.name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p.charAt(0).toUpperCase())
                .join('')}
            </span>
          )}
          <div className="min-w-0 max-w-[46rem]">
            <p className="text-body-sm font-medium text-ink-2">Instructor</p>
            <h1 className="text-h1-sm text-ink sm:text-h1">{i.name}</h1>
            {i.headline ? <p className="mt-2 text-body-lg text-ink-2">{i.headline}</p> : null}
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              {stats.map(([value, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="text-body-sm text-ink-2">
                    <span className="block text-h3 text-ink">{value}</span>
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
            {i.links.length > 0 ? (
              <ul className="mt-5 flex flex-wrap gap-2">
                {i.links.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      rel="nofollow noopener me"
                      target="_blank"
                      className="inline-flex h-11 items-center rounded-full border border-border px-4 text-body-sm text-ink-2 hover:border-ink-3 hover:text-ink sm:h-9"
                    >
                      {linkLabel[l.kind] ?? 'Link'}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-catalog flex-col gap-12 px-4 pt-10 pb-16 sm:px-6 lg:px-8">
        {i.bio ? (
          <section aria-labelledby="about-title" className="max-w-[46rem]">
            <h2 id="about-title" className="text-h2 text-ink">
              About {i.name.split(/\s+/)[0]}
            </h2>
            <p className="mt-3 whitespace-pre-line text-body text-ink-2">{i.bio}</p>
          </section>
        ) : null}

        <section aria-labelledby="courses-title">
          <h2 id="courses-title" className="text-h2 text-ink">
            Courses by {i.name}
          </h2>
          {i.courses.length > 0 ? (
            <div className="mt-6">
              <CourseGrid courses={i.courses} label={`Courses by ${i.name}`} list="instructor" />
            </div>
          ) : (
            <p className="mt-3 text-body text-ink-2">No live courses right now.</p>
          )}
        </section>
      </div>

      <Track />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: i.name,
            url: `${site}/instructors/${i.slug}`,
            ...(i.headline ? { jobTitle: i.headline } : {}),
            ...(i.avatarUrl ? { image: i.avatarUrl } : {}),
            ...(i.bio ? { description: i.bio.slice(0, 300) } : {}),
            ...(i.links.length > 0 ? { sameAs: i.links.map((l) => l.url) } : {}),
          },
        }}
      />
    </>
  )
}
