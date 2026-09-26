import {
  Briefcase,
  Calculator,
  Camera,
  ChevronRight,
  Cloud,
  Code,
  Megaphone,
  PenTool,
  Sheet,
} from 'lucide-react'
import Link from 'next/link'
import { topics } from '@/lib/topics'

// Server Component: Lucide renders to plain SVG here, no client JS.
const icons: Record<string, typeof Sheet> = {
  excel: Sheet,
  programming: Code,
  design: PenTool,
  marketing: Megaphone,
  accounting: Calculator,
  business: Briefcase,
  video: Camera,
  cloud: Cloud,
}

export function TopicGrid() {
  return (
    <div className="overflow-hidden rounded-dialog border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-4">
        <h2 className="text-h4 text-ink">Browse by topic</h2>
        <Link
          href="/courses"
          className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          All courses
        </Link>
      </div>
      <ul className="grid gap-px bg-border sm:grid-cols-2">
        {topics.map((topic) => {
          const Icon = icons[topic.query] ?? Sheet
          return (
            <li key={topic.query} className="bg-surface">
              <Link
                href={`/courses?q=${encodeURIComponent(topic.query)}`}
                className="group flex items-center gap-3 px-6 py-4 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink">
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-ink">{topic.name}</span>
                  <span className="block text-body-sm text-ink-3">{topic.examples}</span>
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
