'use client'
// Client component: the tabs under a lesson (docs/20 player): Overview, Notes, and with the
// `community` flag Q&A (this lesson's questions) and Announcements. Files sit under the lesson
// itself, where learners look for them. Each panel's code loads only when its tab opens.

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tokslearn/ui/tabs'
import dynamic from 'next/dynamic'
import { type ReactNode, useEffect, useState } from 'react'
import { NOTE_EVENT } from '@/lib/learn-api'

const ThreadList = dynamic(
  () => import('@/components/community/thread-list').then((m) => m.ThreadList),
  { loading: () => <div className="h-32 animate-pulse rounded-card bg-surface-sunken" /> },
)

const NotesPanel = dynamic(() => import('./notes-panel').then((m) => m.NotesPanel), {
  loading: () => <div className="h-32 animate-pulse rounded-card bg-surface-sunken" />,
})

export function LessonTabs({
  lessonId,
  courseId,
  overview,
  community = null,
}: {
  lessonId: string
  courseId: string
  overview: ReactNode
  /** Set when the `community` flag is on. */
  community?: { courseSlug: string } | null
}) {
  const [tab, setTab] = useState('overview')
  const [noteAt, setNoteAt] = useState<number | null>(null)

  useEffect(() => {
    const open = (e: Event) => {
      setNoteAt((e as CustomEvent<{ positionSec: number | null }>).detail.positionSec)
      setTab('notes')
    }
    window.addEventListener(NOTE_EVENT, open)
    return () => window.removeEventListener(NOTE_EVENT, open)
  }, [])

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="About this lesson">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        {community ? <TabsTrigger value="qa">Q&amp;A</TabsTrigger> : null}
        {community ? <TabsTrigger value="news">Announcements</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="notes">
        <NotesPanel lessonId={lessonId} courseId={courseId} initialTime={noteAt} />
      </TabsContent>
      {community ? (
        <>
          <TabsContent value="qa">
            {tab === 'qa' ? (
              <ThreadList
                courseId={courseId}
                courseSlug={community.courseSlug}
                scope={{ type: 'lesson', id: lessonId }}
                kinds={['question']}
                newLabel="Ask a question"
                empty="No questions about this lesson yet. Stuck on something? Ask; your instructor or a TA answers."
              />
            ) : null}
          </TabsContent>
          <TabsContent value="news">
            {tab === 'news' ? (
              <ThreadList
                courseId={courseId}
                courseSlug={community.courseSlug}
                fixedFilter="announcements"
                kinds={[]}
                newLabel="New announcement"
                empty="No announcements yet."
              />
            ) : null}
          </TabsContent>
        </>
      ) : null}
    </Tabs>
  )
}
