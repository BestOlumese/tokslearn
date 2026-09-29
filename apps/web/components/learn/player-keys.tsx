'use client'
// Client component: player shortcuts (docs/10 §3): N next, P previous, B bookmark, M note at the
// current time. Ignored while typing, and while focus is inside the video (Bunny has its own keys).

import { toast } from '@tokslearn/ui/toast'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { capture } from '@/lib/analytics'
import {
  BOOKMARKS_EVENT,
  clock,
  LearnError,
  requestNote,
  toggleBookmark,
  videoTime,
} from '@/lib/learn-api'
import { autoplayNext } from './video-lesson'

const typing = (el: Element | null) =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLElement && el.isContentEditable)

export function PlayerKeys({
  lessonId,
  courseId,
  previousHref,
  nextHref,
}: {
  lessonId: string
  courseId: string
  previousHref: string | null
  nextHref: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(document.activeElement)) return
      const key = e.key.toLowerCase()
      if (key === 'n' && nextHref) {
        if (videoTime() !== null) autoplayNext()
        router.push(nextHref as Route)
      } else if (key === 'p' && previousHref) {
        router.push(previousHref as Route)
      } else if (key === 'm') {
        e.preventDefault()
        requestNote(videoTime())
      } else if (key === 'b') {
        const at = videoTime()
        const position = at === null ? null : Math.floor(at)
        toggleBookmark(lessonId, position)
          .then((r) => {
            if (r.bookmarked) capture('bookmark_created', { course_id: courseId })
            window.dispatchEvent(new Event(BOOKMARKS_EVENT))
            const where = position === null ? 'this lesson' : clock(position)
            toast(r.bookmarked ? `Bookmarked ${where}` : `Bookmark at ${where} removed`)
          })
          .catch((err) =>
            toast.error(err instanceof LearnError ? err.message : 'That didn’t save. Try again.'),
          )
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lessonId, courseId, previousHref, nextHref, router])

  return null
}
