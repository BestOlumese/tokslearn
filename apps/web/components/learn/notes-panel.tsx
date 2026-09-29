'use client'
// Client component: private notes and bookmarks for one lesson (docs/10 §4). Loaded only when the
// Notes tab opens. `M` opens it with the video's current time; `B` bookmarks (player-keys.tsx).

import { Button } from '@tokslearn/ui/button'
import { Textarea } from '@tokslearn/ui/textarea'
import { Bookmark, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { capture } from '@/lib/analytics'
import {
  BOOKMARKS_EVENT,
  type BookmarkItem,
  clock,
  createNote,
  deleteNote,
  LearnError,
  listBookmarks,
  listNotes,
  NOTE_EVENT,
  type NoteItem,
  requestSeek,
  toggleBookmark,
  updateNote,
  videoTime,
} from '@/lib/learn-api'

const MAX = 2000
const failed = (e: unknown) =>
  e instanceof LearnError ? e.message : 'That didn’t save. Try again.'

export function NotesPanel({
  lessonId,
  courseId,
  initialTime,
}: {
  lessonId: string
  courseId: string
  /** Set when the panel was opened with `M`. */
  initialTime: number | null
}) {
  const [notes, setNotes] = useState<NoteItem[] | null>(null)
  const [marks, setMarks] = useState<BookmarkItem[]>([])
  const [body, setBody] = useState('')
  const [at, setAt] = useState<number | null>(initialTime)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let live = true
    Promise.all([listNotes(lessonId), listBookmarks(courseId)])
      .then(([n, b]) => {
        if (!live) return
        setNotes(n.items)
        setMarks(b.items.filter((m) => m.lessonId === lessonId))
      })
      .catch((e) => {
        if (!live) return
        setNotes([])
        setError(failed(e))
      })
    const reloadMarks = () => {
      listBookmarks(courseId)
        .then((b) => live && setMarks(b.items.filter((m) => m.lessonId === lessonId)))
        .catch(() => undefined)
    }
    window.addEventListener(BOOKMARKS_EVENT, reloadMarks)
    return () => {
      live = false
      window.removeEventListener(BOOKMARKS_EVENT, reloadMarks)
    }
  }, [lessonId, courseId])

  useEffect(() => {
    if (initialTime !== null) box.current?.focus()
    const onNote = (e: Event) => {
      setAt((e as CustomEvent<{ positionSec: number | null }>).detail.positionSec)
      box.current?.focus()
    }
    window.addEventListener(NOTE_EVENT, onNote)
    return () => window.removeEventListener(NOTE_EVENT, onNote)
  }, [initialTime])

  const add = async () => {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    setError(null)
    try {
      const n = await createNote({ lessonId, positionSec: at, body: text })
      setNotes((list) =>
        [...(list ?? []), { ...n, lessonId, createdAt: new Date().toISOString() }].sort(
          (a, b) => (a.positionSec ?? -1) - (b.positionSec ?? -1),
        ),
      )
      setBody('')
      setAt(null)
      capture('note_created', { course_id: courseId })
    } catch (e) {
      setError(failed(e))
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (!editing) return
    try {
      const n = await updateNote(editing.id, editing.body)
      setNotes((list) => list?.map((x) => (x.id === n.id ? { ...x, body: n.body } : x)) ?? null)
      setEditing(null)
    } catch (e) {
      setError(failed(e))
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteNote(id)
      setNotes((list) => list?.filter((x) => x.id !== id) ?? null)
    } catch (e) {
      setError(failed(e))
    }
  }

  const unmark = async (m: BookmarkItem) => {
    try {
      await toggleBookmark(m.lessonId, m.positionSec)
      setMarks((list) => list.filter((x) => x.id !== m.id))
    } catch (e) {
      setError(failed(e))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <label htmlFor="note-body" className="text-body-sm font-medium text-ink">
          New note
          {at !== null ? (
            <span className="ml-2 inline-flex items-center gap-1 rounded-control bg-brand-soft px-1.5 text-caption text-brand-ink">
              at {clock(at)}
              <button
                type="button"
                aria-label="Don’t link this note to a time"
                onClick={() => setAt(null)}
                className="rounded-sm hover:text-ink"
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          ) : null}
        </label>
        <Textarea
          id="note-body"
          ref={box}
          value={body}
          maxLength={MAX}
          rows={3}
          placeholder="Only you can see your notes."
          onFocus={() => {
            if (at === null && body === '') setAt(videoTime())
          }}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add()
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-ink-3">
            {body.length > MAX - 200 ? `${MAX - body.length} characters left` : ''}
          </p>
          <Button type="submit" size="sm" loading={saving} disabled={!body.trim()}>
            Save note
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}

      {marks.length > 0 ? (
        <section aria-labelledby="bookmarks-title" className="flex flex-col gap-2">
          <h3 id="bookmarks-title" className="text-body-sm font-semibold text-ink">
            Bookmarks
          </h3>
          <ul className="flex flex-wrap gap-2">
            {marks.map((m) => (
              <li
                key={m.id}
                className="inline-flex items-center gap-1 rounded-control border border-border bg-surface pl-2 text-body-sm"
              >
                <Bookmark aria-hidden className="size-3.5 text-brand" />
                {m.positionSec !== null ? (
                  <button
                    type="button"
                    className="text-ink hover:text-brand-ink hover:underline"
                    onClick={() => requestSeek(m.positionSec ?? 0)}
                  >
                    {clock(m.positionSec)}
                  </button>
                ) : (
                  <span className="text-ink">This lesson</span>
                )}
                <button
                  type="button"
                  aria-label="Remove bookmark"
                  onClick={() => void unmark(m)}
                  className="flex size-8 items-center justify-center text-ink-3 hover:text-ink"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {notes === null ? (
        <div className="h-16 animate-pulse rounded-card bg-surface-sunken" />
      ) : notes.length === 0 ? (
        <p className="text-body-sm text-ink-2">
          No notes on this lesson yet. Press M while watching to note the moment.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-3">
                {n.positionSec !== null ? (
                  <button
                    type="button"
                    onClick={() => requestSeek(n.positionSec ?? 0)}
                    className="text-body-sm font-medium text-brand-ink hover:underline"
                  >
                    {clock(n.positionSec)}
                  </button>
                ) : (
                  <span className="text-body-sm text-ink-3">Lesson note</span>
                )}
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => setEditing({ id: n.id, body: n.body })}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="tertiary" onClick={() => void remove(n.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              {editing?.id === n.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    aria-label="Edit note"
                    value={editing.body}
                    maxLength={MAX}
                    rows={3}
                    onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!editing.body.trim()} onClick={() => void save()}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-body text-ink">{n.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
