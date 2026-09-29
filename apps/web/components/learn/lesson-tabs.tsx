'use client'
// Client component: the tabs under a lesson (docs/20 player): Overview and Notes. Files sit under
// the lesson itself, where learners look for them. Q&A and announcements join in Phase 8. The
// notes panel's code loads only when its tab opens.

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tokslearn/ui/tabs'
import dynamic from 'next/dynamic'
import { type ReactNode, useEffect, useState } from 'react'
import { NOTE_EVENT } from '@/lib/learn-api'

const NotesPanel = dynamic(() => import('./notes-panel').then((m) => m.NotesPanel), {
  loading: () => <div className="h-32 animate-pulse rounded-card bg-surface-sunken" />,
})

export function LessonTabs({
  lessonId,
  courseId,
  overview,
}: {
  lessonId: string
  courseId: string
  overview: ReactNode
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
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="notes">
        <NotesPanel lessonId={lessonId} courseId={courseId} initialTime={noteAt} />
      </TabsContent>
    </Tabs>
  )
}
