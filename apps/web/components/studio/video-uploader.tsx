'use client'
// Client component: resumable video upload for one lesson (docs/09 §2). The browser uploads
// straight to Bunny with tus-js-client using short-lived signed headers from the server; chunks
// retry after network drops, and the upload can be paused and resumed.

import type { StudioLessonDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Progress } from '@tokslearn/ui/progress'
import { useRef, useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { createVideoUpload } from '@/lib/video-upload'
import { useCourseEditor } from './course-editor-provider'

const MAX_BYTES = 4 * 1024 * 1024 * 1024
const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

export function VideoUploader({ lesson }: { lesson: StudioLessonDto }) {
  const { course, run, locked, uploads, setUpload } = useCourseEditor()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const active = uploads.find((u) => u.lessonId === lesson.id && u.status !== 'done')

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
    let auth: Awaited<ReturnType<typeof api.media.createVideoUpload>>['upload'] | undefined
    try {
      await run(async (version) => {
        const r = await api.media.createVideoUpload({
          courseId: course.id,
          version,
          lessonId: lesson.id,
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
      { filetype: file.type, title: lesson.title },
      {
        onProgress: (sent, total) => {
          percent = total ? (sent / total) * 100 : 0
          setUpload(lesson.id, { ...base, progress: percent, status: 'uploading' })
        },
        onError: () =>
          setUpload(lesson.id, {
            ...base,
            progress: percent,
            status: 'error',
            error: 'The upload stopped. Check your connection and try again.',
          }),
        onSuccess: () => {
          setUpload(lesson.id, { ...base, progress: 100, status: 'done' })
          // Bunny now encodes the video; the curriculum polls for the result.
          setTimeout(() => setUpload(lesson.id, null), 4000)
        },
      },
    )
    const base = {
      lessonId: lesson.id,
      filename: file.name,
      pause: () => {
        void upload.abort()
        setUpload(lesson.id, { ...base, progress: percent, status: 'paused' })
      },
      resume: () => {
        upload.start()
        setUpload(lesson.id, { ...base, progress: percent, status: 'uploading' })
      },
    }
    setUpload(lesson.id, { ...base, progress: 0, status: 'uploading' })
    upload.start()
  }

  const check = async () => {
    setChecking(true)
    try {
      await run(() => api.studio.lessons.refreshVideo({ courseId: course.id, lessonId: lesson.id }))
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setChecking(false)
    }
  }

  const video = lesson.video
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
      ) : video ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border p-3">
          <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{video.filename}</span>
          {video.status === 'ready' ? (
            <Badge tone="brand">Ready · {minutes(lesson.durationSec)}</Badge>
          ) : video.status === 'failed' ? (
            <Badge tone="danger">Processing failed</Badge>
          ) : (
            <>
              <Badge tone="info">Processing</Badge>
              <Button size="sm" variant="tertiary" loading={checking} onClick={check}>
                Check again
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="text-body-sm text-ink-2">
          No video yet. MP4 works best; up to 4 GB. We make 360p–1080p versions so it plays well on
          mobile data.
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
          {video ? 'Replace video' : 'Upload video'}
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
