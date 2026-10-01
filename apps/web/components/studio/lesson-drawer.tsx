'use client'
// Client component: edit one lesson in a side panel — title, free preview, section, and the
// video, article or files that make up the lesson.

import type { RichTextDoc, StudioLessonDto, StudioSectionDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Select } from '@tokslearn/ui/select'
import { Sheet, SheetContent } from '@tokslearn/ui/sheet'
import { Switch } from '@tokslearn/ui/switch'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { useCourseEditor } from './course-editor-provider'
import { ResourceList } from './resource-list'
import { RichTextEditor } from './rich-text-editor'
import { VideoUploader } from './video-uploader'

const typeLabel = {
  video: 'Video',
  article: 'Article',
  resource: 'Files',
  quiz: 'Quiz',
  assignment: 'Assignment',
  live: 'Live class',
}

export function LessonDrawer({
  lesson,
  sections,
  onOpenChange,
}: {
  lesson: StudioLessonDto | null
  sections: ReadonlyArray<StudioSectionDto>
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={lesson !== null} onOpenChange={onOpenChange}>
      {lesson ? (
        <SheetContent
          side="right"
          title={`${typeLabel[lesson.type]} lesson`}
          description="Changes save as you make them."
          className="w-[min(40rem,100vw)] max-w-none"
        >
          <LessonEditor key={lesson.id} lesson={lesson} sections={sections} />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

function LessonEditor({
  lesson,
  sections,
}: {
  lesson: StudioLessonDto
  sections: ReadonlyArray<StudioSectionDto>
}) {
  const { course, run, locked } = useCourseEditor()
  const [title, setTitle] = useState(lesson.title)
  const [article, setArticle] = useState<RichTextDoc | null>(lesson.articleDoc)
  const [articleDirty, setArticleDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (fn: (version: number) => ReturnType<typeof api.studio.lessons.update>) => {
    setError(null)
    try {
      await run(fn)
      return true
    } catch (e) {
      setError(apiErrorMessage(e))
      return false
    }
  }

  const targets = sections.filter((s) => !s.removalRequested)

  return (
    <div className="flex flex-col gap-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {lesson.removalRequested ? (
        <FormAlert tone="info">
          This lesson leaves the course when your next update is approved.
        </FormAlert>
      ) : null}
      <fieldset disabled={locked} className="flex flex-col gap-5">
        <Field id="lesson-title" label="Title">
          {(p) => (
            <Input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim().length >= 3 && title !== lesson.title) {
                  void save((version) =>
                    api.studio.lessons.update({
                      courseId: course.id,
                      version,
                      lessonId: lesson.id,
                      title,
                    }),
                  )
                }
              }}
              {...p}
            />
          )}
        </Field>
        {lesson.type === 'quiz' || lesson.type === 'assignment' ? null : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="lesson-preview">Free preview</Label>
              <p className="text-body-sm text-ink-2">
                Anyone can watch or read it on the course page before buying.
              </p>
            </div>
            <Switch
              id="lesson-preview"
              checked={lesson.isPreview}
              onChange={(e) => {
                // Read now: the write runs later in a queue, after React resets the controlled box.
                const isPreview = e.target.checked
                void save((version) =>
                  api.studio.lessons.update({
                    courseId: course.id,
                    version,
                    lessonId: lesson.id,
                    isPreview,
                  }),
                )
              }}
            />
          </div>
        )}
        <Field id="lesson-section" label="Section">
          {(p) => (
            <Select
              value={lesson.sectionId}
              onChange={(e) => {
                const to = targets.find((s) => s.id === e.target.value)
                if (!to) return
                void save((version) =>
                  api.studio.lessons.move({
                    courseId: course.id,
                    version,
                    lessonId: lesson.id,
                    toSectionId: to.id,
                    toIndex: to.lessons.length,
                  }),
                )
              }}
              {...p}
            >
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </fieldset>

      {lesson.quizId || lesson.assignmentId ? (
        <section aria-labelledby="builder-title" className="flex flex-col gap-3">
          <h3 id="builder-title" className="text-h4 text-ink">
            {lesson.quizId ? 'Questions and settings' : 'Brief, rubric and due date'}
          </h3>
          <p className="text-body-sm text-ink-2">
            {lesson.quizId
              ? 'Pick questions from your question banks, set the time limit, attempts and pass mark.'
              : 'Write what learners should hand in, how you grade it, and when it’s due.'}
          </p>
          <Link
            href={
              `/teach/courses/${course.id}/assessments?${lesson.quizId ? `quiz=${lesson.quizId}` : `assignment=${lesson.assignmentId}`}` as Route
            }
            className="w-fit text-body-sm font-medium text-brand-ink hover:underline"
          >
            {lesson.quizId ? 'Open the quiz builder' : 'Open the assignment builder'}
          </Link>
        </section>
      ) : null}

      {lesson.type === 'live' ? (
        <section aria-labelledby="live-title" className="flex flex-col gap-2">
          <h3 id="live-title" className="text-h4 text-ink">
            Live class
          </h3>
          <p className="text-body text-ink-2">
            Learners see the class time, a Join button and, afterwards, the recording here. Set the
            time on the Live page and pick this lesson; cohort courses can have one class per cohort
            on the same lesson.
          </p>
          <Link
            href={'/teach/live' as Route}
            className="w-fit text-body-sm font-medium text-brand-ink hover:underline"
          >
            Schedule on the Live page
          </Link>
        </section>
      ) : null}

      {lesson.type === 'video' ? (
        <section aria-labelledby="video-title" className="flex flex-col gap-3">
          <h3 id="video-title" className="text-h4 text-ink">
            Video
          </h3>
          <VideoUploader lesson={lesson} />
        </section>
      ) : null}

      {lesson.type === 'article' ? (
        <section aria-labelledby="article-title" className="flex flex-col gap-3">
          <h3 id="article-title" className="text-h4 text-ink">
            Article
          </h3>
          <RichTextEditor
            id="article-body"
            value={article}
            disabled={locked}
            minHeight="min-h-72"
            onChange={(doc) => {
              setArticle(doc)
              setArticleDirty(true)
            }}
          />
          <Button
            type="button"
            className="w-fit"
            loading={saving}
            disabled={locked || !articleDirty}
            onClick={async () => {
              setSaving(true)
              const ok = await save((version) =>
                api.studio.lessons.update({
                  courseId: course.id,
                  version,
                  lessonId: lesson.id,
                  article,
                }),
              )
              setSaving(false)
              if (ok) setArticleDirty(false)
            }}
          >
            {articleDirty ? 'Save article' : 'Saved'}
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="files-title" className="flex flex-col gap-3">
        <h3 id="files-title" className="text-h4 text-ink">
          Files
        </h3>
        <ResourceList lesson={lesson} />
      </section>
    </div>
  )
}
