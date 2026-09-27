import type { CategoryDirectoryDto } from '@tokslearn/contract'
import {
  Briefcase,
  Calculator,
  Camera,
  ChevronRight,
  Code,
  Megaphone,
  PenTool,
  Sheet,
  ShieldCheck,
  Sprout,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'

// Server Component: Lucide renders to plain SVG here, no client JS.
const icons: Record<string, typeof Sheet> = {
  business: Briefcase,
  'finance-and-accounting': Calculator,
  'office-and-data': Sheet,
  development: Code,
  design: PenTool,
  marketing: Megaphone,
  'it-and-security': ShieldCheck,
  'photo-and-video': Camera,
  'personal-development': Sprout,
}

/** Home page category grid with course counts, below the hero (docs/11 §5). */
export function CategoryPanel({ categories }: { categories: CategoryDirectoryDto }) {
  return (
    <div className="overflow-hidden rounded-dialog border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-4">
        <h2 className="text-h4 text-ink">Browse by category</h2>
        <Link
          href="/categories"
          className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          All categories
        </Link>
      </div>
      <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {categories.slice(0, 8).map((c) => {
          const Icon = icons[c.slug] ?? Sheet
          return (
            <li key={c.id} className="bg-surface">
              <Link
                href={`/categories/${c.slug}` as Route}
                className="group flex items-center gap-3 px-6 py-4 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink">
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-ink">{c.name}</span>
                  <span className="block text-body-sm text-ink-3">
                    {c.count > 0
                      ? `${c.count} ${c.count === 1 ? 'course' : 'courses'}`
                      : 'Courses coming'}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-ink-3 group-hover:text-ink"
                  strokeWidth={1.75}
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
