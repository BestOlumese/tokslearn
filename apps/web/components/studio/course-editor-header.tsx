'use client'
// Client component: course title, status, save state, tabs and banners for the editor.

import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FormAlert } from '@/components/auth/form-alert'
import { useCourseEditor } from './course-editor-provider'
import { CourseStatusBadge } from './course-status-badge'

const tabs = [
  ['details', 'Details'],
  ['curriculum', 'Curriculum'],
  ['assessments', 'Assessments'],
  ['pricing', 'Pricing'],
  ['drip', 'Drip schedule'],
  ['learners', 'Learners'],
  ['staff', 'Teaching assistants'],
  ['publish', 'Publish'],
] as const

const saveLabel = { idle: '', saving: 'Saving…', saved: 'All changes saved', error: 'Not saved' }

export function CourseEditorHeader() {
  const { course, saveState, conflict, locked } = useCourseEditor()
  const pathname = usePathname()
  const base = `/teach/courses/${course.id}`
  const missing = course.checklist.filter((i) => !i.done).length

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/teach/courses"
        className="inline-flex min-h-11 w-fit items-center text-body-sm text-brand underline-offset-4 hover:underline"
      >
        All courses
      </Link>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1-sm break-words text-ink">{course.revision.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <CourseStatusBadge
              status={course.status}
              updateInReview={course.isPublished && course.revision.status === 'submitted'}
            />
            <output aria-live="polite" className="text-body-sm text-ink-3">
              {saveLabel[saveState]}
            </output>
          </div>
        </div>
      </div>

      {conflict ? (
        <FormAlert tone="error">
          <span className="flex flex-wrap items-center justify-between gap-3">
            This course was changed in another tab. Reload to see the latest version.
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </span>
        </FormAlert>
      ) : null}
      {!course.canEdit ? (
        <FormAlert tone="info">
          You help with this course, so you can look but not change it. The instructor edits it.
        </FormAlert>
      ) : course.revision.status === 'submitted' ? (
        <FormAlert tone="info">
          {course.isPublished
            ? 'Your update is in review. The live course stays as it is; you can edit again after the review.'
            : 'This course is in review. You can edit it again after the review, usually within 3 working days.'}
        </FormAlert>
      ) : course.revision.reviewNotes ? (
        <FormAlert tone="error">
          <span className="font-medium">The reviewer asked for changes: </span>
          <span className="whitespace-pre-line">{course.revision.reviewNotes}</span>
        </FormAlert>
      ) : null}

      <nav aria-label="Course editor" className="-mx-1 overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-1 px-1">
          {tabs.map(([slug, label]) => {
            const href = `${base}/${slug}`
            const active = pathname === href
            return (
              <li key={slug}>
                <Link
                  href={href as Route}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-body-sm font-medium',
                    active
                      ? 'border-brand text-brand-ink'
                      : 'border-transparent text-ink-2 hover:text-ink',
                  )}
                >
                  {label}
                  {slug === 'publish' && missing > 0 && !locked ? (
                    <span className="rounded-full bg-surface-sunken px-2 text-[12px] text-ink-2 tabular-nums">
                      {missing} to do
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
