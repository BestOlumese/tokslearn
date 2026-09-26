'use client'
// Client component: holds the course being edited and runs every studio write in order.
// Each write sends the latest version; a stale tab gets VERSION_CONFLICT and a reload banner.
// Video uploads live here too, so they keep going while the instructor switches tabs.

import type { StudioCourseDto } from '@tokslearn/contract'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { apiErrorCode } from '@/lib/api-error'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface VideoUploadState {
  lessonId: string
  filename: string
  progress: number
  status: 'uploading' | 'paused' | 'error' | 'done'
  error?: string
  pause?: () => void
  resume?: () => void
}

interface EditorContext {
  course: StudioCourseDto
  /** True when the instructor can't change anything right now (TA, in review, archived). */
  locked: boolean
  saveState: SaveState
  conflict: boolean
  /** Queues a write with the latest version; resolves with the refreshed course. */
  run: (write: (version: number) => Promise<StudioCourseDto>) => Promise<StudioCourseDto>
  replace: (course: StudioCourseDto) => void
  uploads: ReadonlyArray<VideoUploadState>
  setUpload: (lessonId: string, next: VideoUploadState | null) => void
}

const Context = createContext<EditorContext | null>(null)

export function useCourseEditor(): EditorContext {
  const value = useContext(Context)
  if (!value) throw new Error('useCourseEditor must be used inside CourseEditorProvider')
  return value
}

export function CourseEditorProvider({
  initial,
  children,
}: {
  initial: StudioCourseDto
  children: ReactNode
}) {
  const [course, setCourse] = useState(initial)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [conflict, setConflict] = useState(false)
  const [uploads, setUploads] = useState<VideoUploadState[]>([])
  const version = useRef(initial.version)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const replace = useCallback((next: StudioCourseDto) => {
    version.current = next.version
    setCourse(next)
  }, [])

  const run = useCallback(
    (write: (v: number) => Promise<StudioCourseDto>) => {
      const task = queue.current.then(async () => {
        setSaveState('saving')
        try {
          const next = await write(version.current)
          replace(next)
          setSaveState('saved')
          return next
        } catch (error) {
          if (apiErrorCode(error) === 'VERSION_CONFLICT') setConflict(true)
          setSaveState('error')
          throw error
        }
      })
      // Keep the queue alive after a failure; the caller still sees the error.
      queue.current = task.catch(() => undefined)
      return task
    },
    [replace],
  )

  const setUpload = useCallback((lessonId: string, next: VideoUploadState | null) => {
    setUploads((list) => {
      const rest = list.filter((u) => u.lessonId !== lessonId)
      return next ? [...rest, next] : rest
    })
  }, [])

  const locked =
    !course.canEdit || course.revision.status === 'submitted' || course.status === 'archived'

  const value = useMemo(
    () => ({ course, locked, saveState, conflict, run, replace, uploads, setUpload }),
    [course, locked, saveState, conflict, run, replace, uploads, setUpload],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}
