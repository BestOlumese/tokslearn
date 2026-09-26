'use client'
// Client component: publish checklist, submit for review and review history (docs/20 publish).

import type { StudioCourseDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Check, Circle } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/lib/format'
import { api } from '@/lib/orpc'
import { useCourseEditor } from './course-editor-provider'

type Key = StudioCourseDto['checklist'][number]['key']
const items: Readonly<Record<Key, { label: string; tab: string }>> = {
  title: { label: 'Title of 5+ characters and a subtitle', tab: 'details' },
  description: { label: 'Description of at least 200 characters', tab: 'details' },
  outcomes: { label: 'At least 3 things learners will get', tab: 'details' },
  category: { label: 'A category', tab: 'details' },
  cover: { label: 'A cover image', tab: 'details' },
  curriculum: { label: 'Every section has at least one lesson', tab: 'curriculum' },
  preview: { label: 'At least one free preview lesson', tab: 'curriculum' },
  videos_ready: { label: 'Every video has finished processing', tab: 'curriculum' },
  lessons_complete: { label: 'Articles have text and file lessons have files', tab: 'curriculum' },
  pricing: { label: 'Free, or a price between ₦1,000 and ₦5,000,000', tab: 'pricing' },
  minimum_content: { label: 'Paid courses: 30 minutes of video or 5 lessons', tab: 'curriculum' },
}
const historyLabel = {
  draft: 'Draft',
  submitted: 'Waiting for review',
  approved: 'Approved',
  rejected: 'Changes requested',
  superseded: 'Replaced by a later version',
} as const

export function PublishPanel() {
  const { course, run, locked } = useCourseEditor()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'submitted' | 'auto_approved' | null>(null)
  const [pending, setPending] = useState(false)
  const missing = course.checklist.filter((i) => !i.done)
  const inReview = course.revision.status === 'submitted'

  return (
    <div className="flex max-w-[780px] flex-col gap-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {done === 'auto_approved' ? (
        <FormAlert tone="success">
          Your changes were small, so they're live now without a review.
        </FormAlert>
      ) : done === 'submitted' ? (
        <FormAlert tone="success">
          Sent for review. A reviewer usually decides within 3 working days; we'll email you.
        </FormAlert>
      ) : null}

      <SettingsPanel
        id="checklist"
        title="Before you submit"
        description={
          course.isPublished
            ? 'Small changes (typos, lesson titles) go live at once. New sections, price rises over 50%, a new category or cover go to a reviewer.'
            : 'A reviewer checks every course before it goes on sale: that it matches its description, sounds and looks clear, and follows the content rules.'
        }
        footer={
          <Button
            loading={pending}
            disabled={locked || inReview || missing.length > 0}
            onClick={async () => {
              setError(null)
              setPending(true)
              try {
                let outcome: 'submitted' | 'auto_approved' = 'submitted'
                await run(async (version) => {
                  const r = await api.studio.courses.submit({ courseId: course.id, version })
                  outcome = r.outcome
                  return r.course
                })
                setDone(outcome)
              } catch (e) {
                setError(apiErrorMessage(e))
              } finally {
                setPending(false)
              }
            }}
          >
            {course.isPublished ? 'Submit update' : 'Submit for review'}
          </Button>
        }
      >
        <ul className="flex flex-col gap-2.5">
          {course.checklist.map((i) => (
            <li key={i.key} className="flex items-start gap-3">
              {i.done ? (
                <Check
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-brand"
                  strokeWidth={2.5}
                />
              ) : (
                <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-3" />
              )}
              <span className="flex-1 text-body text-ink">
                {items[i.key].label}
                <span className="sr-only">{i.done ? ' (done)' : ' (to do)'}</span>
              </span>
              {!i.done ? (
                <Link
                  href={`/teach/courses/${course.id}/${items[i.key].tab}` as Route}
                  className="text-body-sm font-medium text-brand-ink underline-offset-4 hover:underline"
                >
                  Fix
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </SettingsPanel>

      <SettingsPanel id="history" title="Review history">
        {course.history.length === 0 ? (
          <p className="text-body text-ink-2">Not submitted yet.</p>
        ) : (
          <ol className="divide-y divide-border">
            {course.history.map((h) => (
              <li key={h.id} className="flex flex-col gap-1.5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium text-ink">Version {h.number}</span>
                  <Badge
                    tone={
                      h.status === 'approved'
                        ? 'brand'
                        : h.status === 'rejected'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {historyLabel[h.status]}
                  </Badge>
                  <span className="text-body-sm text-ink-3">
                    {h.submittedAt ? `Submitted ${formatDateTime(h.submittedAt)}` : ''}
                  </span>
                </div>
                {h.reviewNotes ? (
                  <p className="whitespace-pre-line rounded-control bg-surface-sunken px-3 py-2 text-body-sm text-ink">
                    {h.reviewNotes}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </SettingsPanel>
    </div>
  )
}
