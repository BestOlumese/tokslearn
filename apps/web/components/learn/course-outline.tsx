import { cn } from '@tokslearn/ui/cn'
import { Circle, CircleCheck, CircleDot, Lock } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { formatDayMonth, formatDuration } from '@/lib/format'

// The player's outline (docs/20 `/learn/…`): sections, ticks, drip locks with their dates, and
// the current lesson highlighted. Server-rendered; the mobile sheet reuses it.

export interface OutlineView {
  courseSlug: string
  sections: Array<{
    id: string
    title: string
    lessons: Array<{
      id: string
      title: string
      durationSec: number
      status: 'not_started' | 'in_progress' | 'completed'
      locked: boolean
      unlocksAt: Date | null
    }>
  }>
}

const statusLabel = {
  completed: 'Completed',
  in_progress: 'Started',
  not_started: 'Not started',
} as const

export function CourseOutline({ outline, current }: { outline: OutlineView; current: string }) {
  return (
    <nav aria-label="Course outline" className="flex flex-col gap-5">
      {outline.sections.map((s, i) => {
        const done = s.lessons.filter((l) => l.status === 'completed').length
        return (
          <section key={s.id} aria-labelledby={`section-${s.id}`}>
            <h2 id={`section-${s.id}`} className="flex items-baseline justify-between gap-3 px-2">
              <span className="text-body-sm font-semibold text-ink">
                {i + 1}. {s.title}
              </span>
              <span className="shrink-0 text-caption text-ink-3">
                {done}/{s.lessons.length}
              </span>
            </h2>
            <ol className="mt-1.5 flex flex-col">
              {s.lessons.map((l) => {
                const here = l.id === current
                const Icon = l.locked
                  ? Lock
                  : l.status === 'completed'
                    ? CircleCheck
                    : l.status === 'in_progress'
                      ? CircleDot
                      : Circle
                return (
                  <li key={l.id}>
                    <Link
                      href={`/learn/${outline.courseSlug}/${l.id}` as Route}
                      aria-current={here ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-start gap-2.5 rounded-control px-2 py-2 text-body-sm',
                        here
                          ? 'bg-brand-soft text-ink'
                          : 'text-ink-2 hover:bg-canvas hover:text-ink',
                      )}
                    >
                      <Icon
                        aria-hidden
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          l.status === 'completed' && !l.locked ? 'text-brand' : 'text-ink-3',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block', here && 'font-medium')}>{l.title}</span>
                        <span className="block text-caption text-ink-3">
                          {l.locked && l.unlocksAt
                            ? `Opens ${formatDayMonth(l.unlocksAt)}`
                            : `${statusLabel[l.status]}${l.durationSec ? ` · ${formatDuration(l.durationSec)}` : ''}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </nav>
  )
}
