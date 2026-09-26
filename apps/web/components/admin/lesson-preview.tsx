'use client'
// Client component: opens one lesson for the reviewer — signed video, article, file links.

import { useQuery } from '@tanstack/react-query'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@tokslearn/ui/dialog'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { useState } from 'react'
import { RichHtml } from '@/components/rich-html'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'

export function LessonPreview({
  revisionId,
  lessonId,
  title,
}: {
  revisionId: string
  lessonId: string
  title: string
}) {
  const [open, setOpen] = useState(false)
  const preview = useQuery({
    ...orpc.admin.courseReviews.previewLesson.queryOptions({ input: { revisionId, lessonId } }),
    enabled: open,
    staleTime: 60 * 60 * 1000,
  })
  const d = preview.data
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="tertiary" aria-label={`Open ${title}`}>
          Open
        </Button>
      </DialogTrigger>
      <DialogContent title={title} className="max-w-[860px]">
        {preview.isPending ? (
          <Skeleton className="aspect-video w-full" />
        ) : preview.isError ? (
          <p className="text-body text-danger">{apiErrorMessage(preview.error)}</p>
        ) : d ? (
          <div className="flex flex-col gap-4">
            {d.type === 'video' ? (
              d.embedUrl ? (
                <div className="aspect-video w-full overflow-hidden rounded-card bg-ink">
                  <iframe
                    src={d.embedUrl}
                    title={d.title}
                    loading="lazy"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    className="size-full border-0"
                  />
                </div>
              ) : (
                <p className="text-body text-ink-2">
                  {d.videoStatus === 'failed'
                    ? 'The video failed to process.'
                    : 'The video is still processing.'}
                </p>
              )
            ) : null}
            {d.articleHtml ? (
              <RichHtml html={d.articleHtml} className="text-body text-ink" />
            ) : null}
            {d.resources.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {d.resources.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-body">
                    <span>
                      {r.title}
                      {r.isImportant ? <span className="text-ink-3"> · important</span> : null}
                    </span>
                    <a
                      href={r.url}
                      className="text-brand underline underline-offset-4"
                      rel="noopener noreferrer"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
