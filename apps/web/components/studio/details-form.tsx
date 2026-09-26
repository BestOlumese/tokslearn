'use client'

// Client component: course details with autosave (docs/10 §1: debounced 1 s, conflict detection).

import type { CategoryDto, RichTextDoc, StudioCourseDto } from '@tokslearn/contract'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Select } from '@tokslearn/ui/select'
import { useEffect, useRef, useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorCode, apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { CategorySelect } from './category-select'
import { useCourseEditor } from './course-editor-provider'
import { CoverUpload } from './cover-upload'
import { ListInput } from './list-input'
import { RichTextEditor } from './rich-text-editor'

type Details = {
  title: string
  subtitle: string
  description: RichTextDoc | null
  outcomes: string[]
  requirements: string[]
  level: StudioCourseDto['revision']['level']
  language: 'en' | 'yo' | 'ig' | 'ha' | 'pcm' | 'fr'
  categoryId: string
  coverFileId: string | null
  tags: string
}

const languages = [
  ['en', 'English'],
  ['pcm', 'Nigerian Pidgin'],
  ['yo', 'Yorùbá'],
  ['ig', 'Igbo'],
  ['ha', 'Hausa'],
  ['fr', 'French'],
] as const

const levels = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
  ['all', 'All levels'],
] as const

function fromCourse(c: StudioCourseDto): Details {
  const r = c.revision
  return {
    title: r.title,
    subtitle: r.subtitle ?? '',
    description: r.descriptionDoc,
    outcomes: r.outcomes,
    requirements: r.requirements,
    level: r.level,
    language: (languages.find(([v]) => v === r.language)?.[0] ?? 'en') as Details['language'],
    categoryId: r.categoryId ?? '',
    coverFileId: r.coverFileId,
    tags: c.tags.join(', '),
  }
}

export function DetailsForm({ categories }: { categories: ReadonlyArray<CategoryDto> }) {
  const { course, run, locked } = useCourseEditor()
  const [form, setForm] = useState<Details>(() => fromCourse(course))
  const [error, setError] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState(course.revision.coverUrl)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const set = <K extends keyof Details>(key: K, value: Details[K]) => {
    dirty.current = true
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Autosave one second after the last change.
  useEffect(() => {
    if (!dirty.current || locked) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (form.title.trim().length < 3 || !form.categoryId) return
      dirty.current = false
      setError(null)
      run((version) =>
        api.studio.courses.updateDetails({
          courseId: course.id,
          version,
          title: form.title,
          subtitle: form.subtitle.trim() || null,
          description: form.description,
          outcomes: form.outcomes.filter((o) => o.trim()),
          requirements: form.requirements.filter((r) => r.trim()),
          level: form.level,
          language: form.language,
          categoryId: form.categoryId,
          coverFileId: form.coverFileId,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length >= 2)
            .slice(0, 10),
        }),
      ).catch((e) => {
        if (apiErrorCode(e) !== 'VERSION_CONFLICT') setError(apiErrorMessage(e))
      })
    }, 1000)
    return () => clearTimeout(timer.current)
  }, [form, locked, run, course.id])

  const titleError = form.title.trim().length < 3 ? 'At least 3 characters.' : undefined

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <SettingsPanel
        id="basics"
        title="Title and summary"
        description="What learners see first in search and on the course page."
      >
        <fieldset disabled={locked} className="flex flex-col gap-5">
          <Field
            id="title"
            label="Title"
            error={titleError}
            helper="Say what they'll learn, not a slogan."
          >
            {(p) => (
              <Input
                value={form.title}
                maxLength={120}
                onChange={(e) => set('title', e.target.value)}
                {...p}
              />
            )}
          </Field>
          <Field
            id="subtitle"
            label="Subtitle"
            helper="One line on who it's for and the result, e.g. “Month-end reporting for accountants who use Excel daily”."
          >
            {(p) => (
              <Input
                value={form.subtitle}
                maxLength={160}
                onChange={(e) => set('subtitle', e.target.value)}
                {...p}
              />
            )}
          </Field>
          <Field
            id="description"
            label="Description"
            helper="At least 200 characters: what the course covers, how it's taught, and who it's not for."
          >
            {(p) => (
              <RichTextEditor
                id={p.id}
                describedBy={p['aria-describedby']}
                value={form.description}
                disabled={locked}
                onChange={(doc) => set('description', doc)}
              />
            )}
          </Field>
        </fieldset>
      </SettingsPanel>

      <SettingsPanel
        id="outcomes"
        title="What learners will get"
        description="Specific outcomes. At least three; reviewers check the course delivers them."
      >
        <fieldset disabled={locked} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-medium text-ink">By the end, learners can…</p>
            <ListInput
              id="outcome"
              label="Outcome"
              values={form.outcomes}
              placeholder="Build a month-end report with pivot tables"
              disabled={locked}
              onChange={(v) => set('outcomes', v)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-medium text-ink">Before starting, learners need…</p>
            <ListInput
              id="requirement"
              label="Requirement"
              values={form.requirements}
              placeholder="Excel 2016 or newer on a laptop"
              disabled={locked}
              onChange={(v) => set('requirements', v)}
            />
          </div>
        </fieldset>
      </SettingsPanel>

      <SettingsPanel id="audience" title="Level, language and category">
        <fieldset disabled={locked} className="grid gap-5 sm:grid-cols-2">
          <Field id="level" label="Level">
            {(p) => (
              <Select
                value={form.level}
                onChange={(e) => set('level', e.target.value as Details['level'])}
                {...p}
              >
                {levels.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="language" label="Language it's taught in">
            {(p) => (
              <Select
                value={form.language}
                onChange={(e) => set('language', e.target.value as Details['language'])}
                {...p}
              >
                {languages.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="category" label="Category">
            {(p) => (
              <CategorySelect
                categories={categories}
                value={form.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
                {...p}
              />
            )}
          </Field>
          <Field id="tags" label="Tags" helper="Up to 10 search words, separated by commas.">
            {(p) => (
              <Input
                value={form.tags}
                maxLength={400}
                onChange={(e) => set('tags', e.target.value)}
                {...p}
              />
            )}
          </Field>
        </fieldset>
      </SettingsPanel>

      <SettingsPanel id="cover" title="Cover image">
        <CoverUpload
          url={coverUrl}
          disabled={locked}
          onUploaded={(fileId, url) => {
            setCoverUrl(url)
            set('coverFileId', fileId)
          }}
        />
      </SettingsPanel>
    </div>
  )
}
