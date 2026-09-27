'use client'
// Client component: the course trailer (docs/20 `/courses/[slug]` promo). Same resumable upload
// as lesson videos; it lives in the editor's upload list under the id "promo" so it keeps going
// while the instructor switches tabs. Changes go live with the next approved revision.

import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Progress } from '@tokslearn/ui/progress'
import { useRef, useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { createVideoUpload } from '@/lib/video-upload'
import { useCourseEditor } from './course-editor-provider'

const MAX_BYTES = 4 * 1024 * 1024 * 1024
const KEY = 'promo'
const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

export function PromoVideo() {
  const { course, run, locked, uploads, setUpload } = useCourseEditor()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const active = uploads.find((u) => u.lessonId === KEY && u.status !== 'done')
  const promo = course.revision.promo

  const start = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!file.type.startsWith('video/')) {
      setError('Choose a video file (MP4, MOV or WebM).')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Videos must be under 4 GB.')
      return
    }
    let auth: Awaited<ReturnType<typeof api.media.createPromoVideoUpload>>['upload'] | undefined
    try {
      await run(async (version) => {
        const r = await api.media.createPromoVideoUpload({
          courseId: course.id,
          version,
          filename: file.name,
          sizeBytes: file.size,
          mime: file.type,
        })
        auth = r.upload
        return r.course
      })
    } catch (e) {
      setError(apiErrorMessage(e))
      return
    }
    if (!auth) return
    let percent = 0
    const upload = createVideoUpload(
      file,
      auth,
      { filetype: file.type, title: `${course.revision.title} trailer` },
      {
        onProgress: (sent, total) => {
          percent = total ? (sent / total) * 100 : 0
          setUpload(KEY, { ...base, progress: percent, status: 'uploading' })
        },
        onError: () =>
          setUpload(KEY, {
            ...base,
            progress: percent,
            status: 'error',
            error: 'The upload stopped. Check your connection and try again.',
          }),
        onSuccess: () => {
          setUpload(KEY, { ...base, progress: 100, status: 'done' })
          setTimeout(() => setUpload(KEY, null), 4000)
        },
      },
    )
    const base = {
      lessonId: KEY,
      filename: file.name,
      pause: () => {
        void upload.abort()
        setUpload(KEY, { ...base, progress: percent, status: 'paused' })
      },
      resume: () => {
        upload.start()
        setUpload(KEY, { ...base, progress: percent, status: 'uploading' })
      },
    }
    setUpload(KEY, { ...base, progress: 0, status: 'uploading' })
    upload.start()
  }

  const act = async (write: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await write()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {active ? (
        <div className="flex flex-col gap-2 rounded-card border border-border p-3">
          <p className="truncate text-body-sm text-ink">{active.filename}</p>
          {active.status === 'error' ? (
            <p role="alert" className="text-body-sm text-danger">
              {active.error}
            </p>
          ) : (
            <Progress value={active.progress} label={`Uploading ${active.filename}`} />
          )}
          <div className="flex gap-2">
            {active.status === 'uploading' ? (
              <Button size="sm" variant="secondary" onClick={active.pause}>
                Pause
              </Button>
            ) : active.status === 'paused' || active.status === 'error' ? (
              <Button size="sm" variant="secondary" onClick={active.resume}>
                Resume
              </Button>
            ) : null}
          </div>
        </div>
      ) : promo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border p-3">
          <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{promo.filename}</span>
          {promo.status === 'ready' ? (
            <Badge tone="brand">Ready · {minutes(promo.durationSec ?? 0)}</Badge>
          ) : promo.status === 'failed' ? (
            <Badge tone="danger">Processing failed</Badge>
          ) : (
            <>
              <Badge tone="info">Processing</Badge>
              <Button
                size="sm"
                variant="tertiary"
                loading={busy}
                onClick={() =>
                  act(() => run(() => api.studio.courses.refreshPromo({ courseId: course.id })))
                }
              >
                Check again
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="tertiary"
            disabled={locked || busy}
            onClick={() =>
              act(() =>
                run((version) => api.studio.courses.removePromo({ courseId: course.id, version })),
              )
            }
          >
            Remove
          </Button>
        </div>
      ) : (
        <p className="text-body-sm text-ink-2">
          No trailer yet. Without one, the course page offers your first free lesson instead.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {!active ? (
        <Button
          type="button"
          variant="secondary"
          disabled={locked}
          onClick={() => input.current?.click()}
          className="w-fit"
        >
          {promo ? 'Replace trailer' : 'Upload trailer'}
        </Button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void start(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
