'use client'
// Client component: video uploads in progress, visible from every tab of the course editor.

import { Button } from '@tokslearn/ui/button'
import { Progress } from '@tokslearn/ui/progress'
import { useCourseEditor } from './course-editor-provider'

export function UploadQueue() {
  const { uploads } = useCourseEditor()
  if (uploads.length === 0) return null
  return (
    <section
      aria-label="Uploads"
      className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-4 shadow-lg"
    >
      <h2 className="text-body-sm font-semibold text-ink">
        Uploading {uploads.length === 1 ? '1 video' : `${uploads.length} videos`}
      </h2>
      <p className="text-body-sm text-ink-3">Keep this page open until uploads finish.</p>
      <ul className="mt-3 flex flex-col gap-3">
        {uploads.map((u) => (
          <li key={u.lessonId} className="flex flex-col gap-1.5">
            <span className="truncate text-body-sm text-ink">{u.filename}</span>
            {u.status === 'error' ? (
              <span className="text-body-sm text-danger">{u.error}</span>
            ) : u.status === 'done' ? (
              <span className="text-body-sm text-brand-ink">Uploaded. Processing now.</span>
            ) : (
              <Progress value={u.progress} label={`Uploading ${u.filename}`} />
            )}
            {u.status === 'uploading' ? (
              <Button size="sm" variant="tertiary" className="w-fit" onClick={u.pause}>
                Pause
              </Button>
            ) : u.status === 'paused' || u.status === 'error' ? (
              <Button size="sm" variant="tertiary" className="w-fit" onClick={u.resume}>
                Resume
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
