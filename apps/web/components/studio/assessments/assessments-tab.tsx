'use client'
// Client component: the course's Assessments tab (docs/20 `/teach/courses/[id]/assessments`):
// quizzes and exams, assignments, and question banks. The item being edited is in the URL, so
// the curriculum's lesson drawer can link straight to it.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { cn } from '@tokslearn/ui/cn'
import { Input } from '@tokslearn/ui/input'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorDetails, apiErrorMessage } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'
import { ConfirmDialog } from '../confirm-dialog'
import { useCourseEditor } from '../course-editor-provider'
import { AssignmentBuilder } from './assignment-builder'
import { QuestionBankPanel } from './question-bank-panel'
import { QuizBuilder } from './quiz-builder'

const kindLabel = { practice: 'Practice quiz', graded: 'Graded quiz', exam: 'Exam' } as const
type View = 'quizzes' | 'assignments' | 'banks'
const views: ReadonlyArray<[View, string]> = [
  ['quizzes', 'Quizzes and exams'],
  ['assignments', 'Assignments'],
  ['banks', 'Question banks'],
]

export function AssessmentsTab() {
  const { course } = useCourseEditor()
  const params = useSearchParams()
  const base = `/teach/courses/${course.id}/assessments`
  const quizId = params.get('quiz')
  const assignmentId = params.get('assignment')
  const bankId = params.get('bank')
  const view =
    (params.get('view') as View | null) ??
    (bankId ? 'banks' : assignmentId ? 'assignments' : 'quizzes')
  const back = (
    <Link
      href={`${base}?view=${view}` as Route}
      className="inline-flex w-fit items-center gap-1.5 text-body-sm text-ink-2 hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All {views.find(([v]) => v === view)?.[1].toLowerCase()}
    </Link>
  )

  if (quizId) {
    return (
      <div className="flex max-w-[860px] flex-col gap-4">
        {back}
        <QuizBuilder quizId={quizId} courseId={course.id} />
      </div>
    )
  }
  if (assignmentId) {
    return (
      <div className="flex max-w-[860px] flex-col gap-4">
        {back}
        <AssignmentBuilder assignmentId={assignmentId} cohortBased={course.cohortBased} />
      </div>
    )
  }
  if (bankId) {
    return (
      <div className="flex max-w-[860px] flex-col gap-4">
        {back}
        <BankDetail bankId={bankId} />
      </div>
    )
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <nav aria-label="Assessments" className="flex gap-2">
        {views.map(([v, label]) => (
          <Link
            key={v}
            href={`${base}?view=${v}` as Route}
            aria-current={v === view ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-4 text-body-sm',
              v === view
                ? 'border-brand bg-brand-soft font-medium text-brand-ink'
                : 'border-border text-ink-2 hover:text-ink',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view === 'quizzes' ? <QuizList base={base} /> : null}
      {view === 'assignments' ? <AssignmentList base={base} /> : null}
      {view === 'banks' ? <BankList base={base} /> : null}
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-card border border-border bg-surface p-6 text-body text-ink-2">
      {children}
    </p>
  )
}

function QuizList({ base }: { base: string }) {
  const { course } = useCourseEditor()
  const list = useQuery(orpc.studio.quizzes.list.queryOptions({ input: { courseId: course.id } }))
  if (list.isPending) return <Skeleton className="h-40 w-full rounded-card" />
  if (!list.data?.length)
    return <Empty>No quizzes or exams yet. Add a quiz or exam lesson on the Curriculum tab.</Empty>
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
      {list.data.map((q) => (
        <li key={q.id}>
          <Link
            href={`${base}?quiz=${q.id}` as Route}
            className="flex items-center justify-between gap-3 p-4 hover:bg-canvas"
          >
            <span className="min-w-0">
              <span className="block truncate text-body font-medium text-ink">
                {q.lessonTitle ?? 'Untitled quiz'}
              </span>
              <span className="text-body-sm text-ink-2">
                {kindLabel[q.kind]} ·{' '}
                {q.questionsPerAttempt === 1 ? '1 question' : `${q.questionsPerAttempt} questions`}
              </span>
            </span>
            {q.questionsPerAttempt === 0 ? (
              <Badge tone="warning">No questions</Badge>
            ) : !q.isLive ? (
              <Badge tone="info">New</Badge>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function AssignmentList({ base }: { base: string }) {
  const { course } = useCourseEditor()
  const lessons = course.sections.flatMap((s) => s.lessons).filter((l) => l.assignmentId)
  if (lessons.length === 0)
    return <Empty>No assignments yet. Add an assignment lesson on the Curriculum tab.</Empty>
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
      {lessons.map((l) => (
        <li key={l.id}>
          <Link
            href={`${base}?assignment=${l.assignmentId}` as Route}
            className="flex items-center justify-between gap-3 p-4 hover:bg-canvas"
          >
            <span className="truncate text-body font-medium text-ink">{l.title}</span>
            {!l.isLive ? <Badge tone="info">New</Badge> : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function BankList({ base }: { base: string }) {
  const { course } = useCourseEditor()
  const client = useQueryClient()
  const list = useQuery(
    orpc.studio.questionBanks.list.queryOptions({ input: { courseId: course.id } }),
  )
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: () => api.studio.questionBanks.create({ courseId: course.id, title }),
    onSuccess: () => {
      setTitle('')
      void client.invalidateQueries({ queryKey: orpc.studio.questionBanks.list.key() })
    },
    onError: (e) => setError(apiErrorDetails(e)),
  })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-2">
        Keep questions in banks by topic. A quiz can use a fixed list from them, or draw a few at
        random for each attempt.
      </p>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {course.canEdit ? (
        <form
          className="flex max-w-lg gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim().length >= 2) create.mutate()
          }}
        >
          <Input
            aria-label="New bank name"
            placeholder="e.g. Formulas"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" loading={create.isPending}>
            Create bank
          </Button>
        </form>
      ) : null}
      {list.isPending ? (
        <Skeleton className="h-32 w-full rounded-card" />
      ) : list.data?.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {list.data.map((b) => (
            <li key={b.id}>
              <Link
                href={`${base}?bank=${b.id}` as Route}
                className="flex items-center justify-between gap-3 p-4 hover:bg-canvas"
              >
                <span className="truncate text-body font-medium text-ink">{b.title}</span>
                <span className="shrink-0 text-body-sm text-ink-2">
                  {b.questionCount === 1 ? '1 question' : `${b.questionCount} questions`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No question banks yet. Create one above.</Empty>
      )}
    </div>
  )
}

function BankDetail({ bankId }: { bankId: string }) {
  const { course } = useCourseEditor()
  const client = useQueryClient()
  const list = useQuery(
    orpc.studio.questionBanks.list.queryOptions({ input: { courseId: course.id } }),
  )
  const bank = list.data?.find((b) => b.id === bankId)
  const [title, setTitle] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (list.isPending) return <Skeleton className="h-40 w-full rounded-card" />
  if (!bank) return <FormAlert tone="error">We couldn’t find that question bank.</FormAlert>
  const rename = async () => {
    if (title === null || title.trim() === bank.title) return
    try {
      await api.studio.questionBanks.rename({ bankId, title })
      void client.invalidateQueries({ queryKey: orpc.studio.questionBanks.list.key() })
    } catch (e) {
      setError(apiErrorDetails(e))
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <div className="flex flex-wrap items-center gap-2">
        {course.canEdit ? (
          <Input
            aria-label="Bank name"
            value={title ?? bank.title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void rename()}
            className="max-w-md text-h4"
          />
        ) : (
          <h2 className="text-h3 text-ink">{bank.title}</h2>
        )}
        {course.canEdit ? (
          <Button variant="tertiary" onClick={() => setArchiving(true)}>
            Archive bank
          </Button>
        ) : null}
      </div>
      <QuestionBankPanel bank={bank} canEdit={course.canEdit} />
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this bank?"
        description="Its questions stay in past attempts. A quiz that draws from it must stop first."
        confirmLabel="Archive"
        onConfirm={async () => {
          try {
            await api.studio.questionBanks.archive({ bankId })
            void client.invalidateQueries({ queryKey: orpc.studio.questionBanks.list.key() })
            window.location.assign(`/teach/courses/${course.id}/assessments?view=banks`)
          } catch (e) {
            setError(apiErrorMessage(e))
          }
        }}
      />
    </div>
  )
}
