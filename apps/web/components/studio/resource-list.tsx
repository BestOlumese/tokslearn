'use client'
// Client component: downloadable files on a lesson. "Important" files make a sale non-refundable
// once downloaded (docs/05 lesson_resources), so the instructor chooses deliberately.

import type { StudioLessonDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Label } from '@tokslearn/ui/label'
import { FileText, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { uploadFile } from '@/lib/upload-file'
import { useCourseEditor } from './course-editor-provider'

const MAX = 100 * 1024 * 1024
const ACCEPT = '.pdf,.zip,.docx,.xlsx,.pptx,.csv,.txt,.jpg,.jpeg,.png,.mp3'
const size = (b: number) =>
  b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`

export function ResourceList({ lesson }: { lesson: StudioLessonDto }) {
  const { course, run, locked } = useCourseEditor()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX) {
      setError('Files must be under 100 MB.')
      return
    }
    setBusy(true)
    try {
      const done = await uploadFile(file, 'resource')
      await run((version) =>
        api.studio.resources.add({
          courseId: course.id,
          version,
          lessonId: lesson.id,
          fileId: done.fileId,
          title: file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'File',
          isImportant: false,
        }),
      )
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'upload_failed'
          ? 'The upload failed. Try again.'
          : apiErrorMessage(e),
      )
    } finally {
      setBusy(false)
    }
  }

  const act = (fn: (version: number) => ReturnType<typeof api.studio.resources.update>) =>
    run(fn).catch((e) => setError(apiErrorMessage(e)))

  return (
    <div className="flex flex-col gap-3">
      {lesson.resources.length === 0 ? (
        <p className="text-body-sm text-ink-2">
          {lesson.type === 'resource'
            ? 'Add at least one file: a template, workbook or checklist.'
            : 'Optional: attach worksheets or slides learners can download.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {lesson.resources.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <FileText aria-hidden className="hidden size-5 shrink-0 text-ink-3 sm:block" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-ink">{r.title}</p>
                <p className="text-body-sm text-ink-3">{size(r.sizeBytes)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`important-${r.id}`}
                  checked={r.isImportant}
                  disabled={locked}
                  onChange={(e) =>
                    act((version) =>
                      api.studio.resources.update({
                        courseId: course.id,
                        version,
                        resourceId: r.id,
                        isImportant: e.target.checked,
                      }),
                    )
                  }
                />
                <Label htmlFor={`important-${r.id}`} kind="option">
                  Important
                </Label>
              </div>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                disabled={locked}
                aria-label={`Remove ${r.title}`}
                onClick={() =>
                  act((version) =>
                    api.studio.resources.remove({ courseId: course.id, version, resourceId: r.id }),
                  )
                }
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-body-sm text-ink-3">
        Mark a file important if it's the main thing learners pay for. Downloading an important file
        ends the refund window for that learner.
      </p>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        loading={busy}
        disabled={locked}
        onClick={() => input.current?.click()}
        className="w-fit"
      >
        Add a file
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void add(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
