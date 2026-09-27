'use client'
// Client component: the course's public URL (studio.courses.changeSlug). Once a course has been
// live, the old URL keeps working as a permanent redirect.

import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { useCourseEditor } from './course-editor-provider'

export function CourseUrl() {
  const { course, run, locked } = useCourseEditor()
  const [slug, setSlug] = useState(course.slug)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const live = course.status === 'published' || course.status === 'unlisted'

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setSaved(false)
        setSaving(true)
        try {
          const next = await run((version) =>
            api.studio.courses.changeSlug({ courseId: course.id, version, slug }),
          )
          setSlug(next.slug)
          setSaved(true)
        } catch (err) {
          setError(apiErrorMessage(err))
        } finally {
          setSaving(false)
        }
      }}
    >
      <Field
        id="course-slug"
        label="URL"
        error={error}
        helper={
          live
            ? `tokslearn.com/courses/${slug}. Links to the old URL keep working.`
            : `tokslearn.com/courses/${slug}`
        }
      >
        {(p) => (
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase())
              setSaved(false)
            }}
            required
            minLength={3}
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            spellCheck={false}
            autoComplete="off"
            disabled={locked}
            {...p}
          />
        )}
      </Field>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="secondary"
          loading={saving}
          disabled={locked || slug === course.slug}
        >
          Change URL
        </Button>
        {saved ? (
          <p role="status" className="text-body-sm text-ink-2">
            Saved.
          </p>
        ) : null}
      </div>
    </form>
  )
}
