'use client'
// Client component: sections and lessons (docs/20 curriculum). Drag to reorder with a pointer or
// the keyboard (dnd-kit), or use the Move up/Move down buttons; lessons move between sections
// from their edit panel. Videos still processing are re-checked every 15 seconds.

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { StudioLessonDto, StudioSectionDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  FileText,
  GraduationCap,
  GripVertical,
  ListChecks,
  Paperclip,
  Pencil,
  PlayCircle,
  Plus,
  Radio,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { ConfirmDialog } from './confirm-dialog'
import { useCourseEditor } from './course-editor-provider'
import { LessonDrawer } from './lesson-drawer'

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
const typeIcon = {
  video: PlayCircle,
  article: FileText,
  resource: Paperclip,
  quiz: ListChecks,
  assignment: ClipboardList,
  live: Radio,
}
const newTitle = {
  video: 'New video lesson',
  article: 'New article',
  resource: 'Downloads',
  quiz: 'Check your understanding',
  exam: 'Final exam',
  assignment: 'Practice task',
  live: 'Live class',
} as const
type NewType = keyof typeof newTitle

type Pending = { kind: 'section' | 'lesson'; id: string; title: string; live: boolean } | null

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** `liveClasses`: the `live_classes` flag, which offers Live class lessons. */
export function CurriculumEditor({ liveClasses = false }: { liveClasses?: boolean }) {
  const { course, run, locked, uploads } = useCourseEditor()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const [newSection, setNewSection] = useState('')
  const sections = course.sections
  const editing = sections.flatMap((s) => s.lessons).find((l) => l.id === editingId) ?? null

  const act = async (fn: Parameters<typeof run>[0]) => {
    setError(null)
    try {
      return await run(fn)
    } catch (e) {
      setError(apiErrorMessage(e))
      return null
    }
  }

  // Poll videos Bunny is still encoding (webhooks also update them).
  const processing = sections
    .flatMap((s) => s.lessons)
    .filter((l) => l.video && (l.video.status === 'processing' || l.video.status === 'uploading'))
    .filter((l) => !uploads.some((u) => u.lessonId === l.id && u.status !== 'done'))
    .map((l) => l.id)
  const firstProcessing = processing[0]
  useEffect(() => {
    if (!firstProcessing || locked) return
    const t = setInterval(() => {
      void run(() =>
        api.studio.lessons.refreshVideo({ courseId: course.id, lessonId: firstProcessing }),
      ).catch(() => undefined)
    }, 15_000)
    return () => clearInterval(t)
  }, [firstProcessing, locked, run, course.id])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || locked) return
    const kind = active.data.current?.kind
    if (kind === 'section' && over.data.current?.kind === 'section') {
      const toIndex = sections.findIndex((s) => s.id === over.id)
      void act((version) =>
        api.studio.sections.move({
          courseId: course.id,
          version,
          sectionId: String(active.id),
          toIndex,
        }),
      )
    }
    if (kind === 'lesson' && over.data.current?.kind === 'lesson') {
      const section = sections.find((s) => s.id === active.data.current?.sectionId)
      if (!section || over.data.current?.sectionId !== section.id) return
      const toIndex = section.lessons.findIndex((l) => l.id === over.id)
      void act((version) =>
        api.studio.lessons.move({
          courseId: course.id,
          version,
          lessonId: String(active.id),
          toSectionId: section.id,
          toIndex,
        }),
      )
    }
  }

  const addLesson = async (section: StudioSectionDto, type: NewType) => {
    const next = await act((version) =>
      api.studio.lessons.add({
        courseId: course.id,
        version,
        sectionId: section.id,
        type,
        title: newTitle[type],
      }),
    )
    const created = next?.sections.find((s) => s.id === section.id)?.lessons.at(-1)
    if (created) setEditingId(created.id)
  }

  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      <p className="text-body text-ink-2">
        Group lessons into sections. Short lessons (5–15 minutes) are easier to finish on a phone.
        {course.isPublished
          ? ' New sections and lessons stay hidden from learners until your update is approved.'
          : ''}
      </p>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      {sections.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Add your first section below, then add lessons to it."
        />
      ) : (
        <DndContext
          // A fixed id keeps dnd-kit's aria-describedby the same on server and client.
          id="curriculum"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-4">
              {sections.map((section, i) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  index={i}
                  count={sections.length}
                  showNew={course.isPublished}
                  locked={locked}
                  onMove={(toIndex) =>
                    act((version) =>
                      api.studio.sections.move({
                        courseId: course.id,
                        version,
                        sectionId: section.id,
                        toIndex,
                      }),
                    )
                  }
                  onRename={(title) =>
                    act((version) =>
                      api.studio.sections.rename({
                        courseId: course.id,
                        version,
                        sectionId: section.id,
                        title,
                      }),
                    )
                  }
                  onRemove={() =>
                    setPending({
                      kind: 'section',
                      id: section.id,
                      title: section.title,
                      live: section.isLive,
                    })
                  }
                  onAddLesson={(type) => addLesson(section, type)}
                  liveClasses={liveClasses}
                  onEditLesson={setEditingId}
                  onMoveLesson={(lesson, toIndex) =>
                    act((version) =>
                      api.studio.lessons.move({
                        courseId: course.id,
                        version,
                        lessonId: lesson.id,
                        toSectionId: section.id,
                        toIndex,
                      }),
                    )
                  }
                  onRemoveLesson={(lesson) =>
                    setPending({
                      kind: 'lesson',
                      id: lesson.id,
                      title: lesson.title,
                      live: lesson.isLive,
                    })
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {!locked ? (
        <form
          className="flex flex-col gap-2 rounded-card border border-dashed border-border-strong bg-surface p-4 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault()
            if (newSection.trim().length < 3) return
            const ok = await act((version) =>
              api.studio.sections.add({ courseId: course.id, version, title: newSection }),
            )
            if (ok) setNewSection('')
          }}
        >
          <label htmlFor="new-section" className="sr-only">
            New section title
          </label>
          <Input
            id="new-section"
            value={newSection}
            maxLength={120}
            placeholder="New section title, e.g. “Lookups and references”"
            onChange={(e) => setNewSection(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            className="shrink-0"
            disabled={newSection.trim().length < 3}
          >
            <Plus aria-hidden className="size-4" />
            Add section
          </Button>
        </form>
      ) : null}

      <LessonDrawer
        lesson={editing}
        sections={sections}
        onOpenChange={(open) => !open && setEditingId(null)}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === 'section'
            ? `Remove “${pending.title}”?`
            : `Remove “${pending?.title ?? ''}”?`
        }
        description={
          pending?.live
            ? 'Learners keep seeing it until your next update is approved, then it goes.'
            : pending?.kind === 'section'
              ? 'The section and its lessons are deleted. This can’t be undone.'
              : 'The lesson and its files are deleted. This can’t be undone.'
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!pending) return
          await act((version) =>
            pending.kind === 'section'
              ? api.studio.sections.remove({ courseId: course.id, version, sectionId: pending.id })
              : api.studio.lessons.remove({ courseId: course.id, version, lessonId: pending.id }),
          )
        }}
      />
    </div>
  )
}

function SectionCard(props: {
  section: StudioSectionDto
  index: number
  count: number
  showNew: boolean
  locked: boolean
  onMove: (toIndex: number) => void
  onRename: (title: string) => Promise<unknown>
  onRemove: () => void
  onAddLesson: (type: NewType) => void
  liveClasses: boolean
  onEditLesson: (id: string) => void
  onMoveLesson: (lesson: StudioLessonDto, toIndex: number) => void
  onRemoveLesson: (lesson: StudioLessonDto) => void
}) {
  const { section, index, count, locked } = props
  const sortable = useSortable({ id: section.id, data: { kind: 'section' }, disabled: locked })
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(section.title)
  const minutes = section.lessons.reduce((s, l) => s + l.durationSec, 0)

  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn(
        'rounded-card border border-border bg-surface',
        sortable.isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        {!locked ? (
          <button
            type="button"
            className="inline-flex size-9 cursor-grab items-center justify-center rounded-control text-ink-3 hover:bg-surface-sunken active:cursor-grabbing"
            aria-label={`Drag section ${section.title}`}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                if (title.trim().length < 3) return
                await props.onRename(title)
                setRenaming(false)
              }}
            >
              <label htmlFor={`rename-${section.id}`} className="sr-only">
                Section title
              </label>
              <Input
                id={`rename-${section.id}`}
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button type="submit" size="sm">
                Save
              </Button>
              <Button type="button" size="sm" variant="tertiary" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <h3
                className={cn(
                  'text-h4 break-words text-ink',
                  section.removalRequested && 'text-ink-3 line-through',
                )}
              >
                Section {index + 1}: {section.title}
              </h3>
              <p className="text-body-sm text-ink-3">
                {section.lessons.length} {section.lessons.length === 1 ? 'lesson' : 'lessons'}
                {minutes > 0 ? ` · ${clock(minutes)}` : ''}
                {props.showNew && !section.isLive ? ' · New' : ''}
                {section.removalRequested ? ' · Leaves after your update is approved' : ''}
              </p>
            </>
          )}
        </div>
        {!locked && !renaming ? (
          <div className="flex w-full items-center justify-end sm:w-auto">
            <IconButton
              label={`Move ${section.title} up`}
              disabled={index === 0}
              onClick={() => props.onMove(index - 1)}
            >
              <ArrowUp aria-hidden className="size-4" />
            </IconButton>
            <IconButton
              label={`Move ${section.title} down`}
              disabled={index === count - 1}
              onClick={() => props.onMove(index + 1)}
            >
              <ArrowDown aria-hidden className="size-4" />
            </IconButton>
            <IconButton label={`Rename ${section.title}`} onClick={() => setRenaming(true)}>
              <Pencil aria-hidden className="size-4" />
            </IconButton>
            {!section.removalRequested ? (
              <IconButton label={`Remove ${section.title}`} onClick={props.onRemove}>
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <SortableContext
        items={section.lessons.map((l) => l.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="divide-y divide-border">
          {section.lessons.map((lesson, i) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              index={i}
              count={section.lessons.length}
              showNew={props.showNew}
              locked={locked}
              onEdit={() => props.onEditLesson(lesson.id)}
              onMove={(toIndex) => props.onMoveLesson(lesson, toIndex)}
              onRemove={() => props.onRemoveLesson(lesson)}
            />
          ))}
        </ol>
      </SortableContext>

      {!locked && !section.removalRequested ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5 sm:px-4">
          <span className="text-body-sm text-ink-2">Add:</span>
          <Button size="sm" variant="tertiary" onClick={() => props.onAddLesson('video')}>
            <PlayCircle aria-hidden className="size-4" />
            Video
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => props.onAddLesson('article')}>
            <FileText aria-hidden className="size-4" />
            Article
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => props.onAddLesson('resource')}>
            <Paperclip aria-hidden className="size-4" />
            Files
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => props.onAddLesson('quiz')}>
            <ListChecks aria-hidden className="size-4" />
            Quiz
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => props.onAddLesson('exam')}>
            <GraduationCap aria-hidden className="size-4" />
            Exam
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => props.onAddLesson('assignment')}>
            <ClipboardList aria-hidden className="size-4" />
            Assignment
          </Button>
          {props.liveClasses ? (
            <Button size="sm" variant="tertiary" onClick={() => props.onAddLesson('live')}>
              <Radio aria-hidden className="size-4" />
              Live class
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function LessonRow(props: {
  lesson: StudioLessonDto
  index: number
  count: number
  showNew: boolean
  locked: boolean
  onEdit: () => void
  onMove: (toIndex: number) => void
  onRemove: () => void
}) {
  const { lesson, index, count, locked } = props
  const sortable = useSortable({
    id: lesson.id,
    data: { kind: 'lesson', sectionId: lesson.sectionId },
    disabled: locked,
  })
  const Icon = typeIcon[lesson.type]
  const status =
    lesson.type === 'video'
      ? !lesson.video
        ? { tone: 'warning' as const, label: 'No video' }
        : lesson.video.status === 'ready'
          ? null
          : lesson.video.status === 'failed'
            ? { tone: 'danger' as const, label: 'Processing failed' }
            : { tone: 'info' as const, label: 'Processing' }
      : lesson.type === 'resource' && lesson.resources.length === 0
        ? { tone: 'warning' as const, label: 'No files' }
        : lesson.type === 'article' && !lesson.articleDoc
          ? { tone: 'warning' as const, label: 'Empty' }
          : null

  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn(
        'flex flex-wrap items-center gap-2 bg-surface px-3 py-2 sm:flex-nowrap sm:px-4',
        sortable.isDragging && 'relative z-10 shadow-md',
      )}
    >
      {!locked ? (
        <button
          type="button"
          className="inline-flex size-9 cursor-grab items-center justify-center rounded-control text-ink-3 hover:bg-surface-sunken active:cursor-grabbing"
          aria-label={`Drag lesson ${lesson.title}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      ) : null}
      <Icon aria-hidden className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
      <button
        type="button"
        onClick={props.onEdit}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-body text-ink hover:text-brand-ink hover:underline',
          lesson.removalRequested && 'text-ink-3 line-through',
        )}
      >
        {lesson.title}
      </button>
      <span className="flex flex-wrap items-center gap-1.5">
        {lesson.isPreview ? <Badge tone="brand">Preview</Badge> : null}
        {props.showNew && !lesson.isLive && !lesson.removalRequested ? (
          <Badge tone="info">New</Badge>
        ) : null}
        {lesson.removalRequested ? <Badge tone="neutral">Leaves after approval</Badge> : null}
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        {lesson.durationSec > 0 ? (
          <span className="text-body-sm text-ink-3 tabular-nums">{clock(lesson.durationSec)}</span>
        ) : null}
      </span>
      <span className="flex items-center">
        <IconButton label={`Edit ${lesson.title}`} onClick={props.onEdit}>
          <Pencil aria-hidden className="size-4" />
        </IconButton>
        {!locked ? (
          <>
            <IconButton
              label={`Move ${lesson.title} up`}
              disabled={index === 0}
              onClick={() => props.onMove(index - 1)}
            >
              <ArrowUp aria-hidden className="size-4" />
            </IconButton>
            <IconButton
              label={`Move ${lesson.title} down`}
              disabled={index === count - 1}
              onClick={() => props.onMove(index + 1)}
            >
              <ArrowDown aria-hidden className="size-4" />
            </IconButton>
            {!lesson.removalRequested ? (
              <IconButton label={`Remove ${lesson.title}`} onClick={props.onRemove}>
                <Trash2 aria-hidden className="size-4" />
              </IconButton>
            ) : null}
          </>
        ) : null}
      </span>
    </li>
  )
}
