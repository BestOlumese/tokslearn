'use client'

// Client component: the course's learners (docs/20 `/teach/courses/[id]/learners`). Display names
// only, never emails. Cohorts and cohort messages arrive with Phase 8.

import { useQuery } from '@tanstack/react-query'
import type { CourseLearnerDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Progress } from '@tokslearn/ui/progress'
import { Select } from '@tokslearn/ui/select'
import { Skeleton } from '@tokslearn/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tokslearn/ui/table'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'
import { useCourseEditor } from './course-editor-provider'

type Status = 'all' | 'active' | 'completed'

const statusText: Record<CourseLearnerDto['status'], string> = {
  active: 'Learning',
  completed: 'Finished',
  revoked: 'Refunded',
  expired: 'Access ended',
}

export function LearnersTable() {
  const { course } = useCourseEditor()
  const [status, setStatus] = useState<Status>('all')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [more, setMore] = useState<CourseLearnerDto[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const input = {
    courseId: course.id,
    status: status === 'all' ? undefined : status,
    q: q || undefined,
  }
  const first = useQuery(orpc.studio.learners.list.queryOptions({ input }))
  const next = cursor ?? first.data?.nextCursor ?? null
  const rows = [...(first.data?.items ?? []), ...more]

  const reset = () => {
    setMore([])
    setCursor(null)
  }
  const loadMore = async () => {
    if (!next) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await api.studio.learners.list({ ...input, cursor: next })
      setMore((m) => [...m, ...page.items])
      setCursor(page.nextCursor ?? '')
    } catch (e) {
      setMoreError(apiErrorMessage(e))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <search className="w-full max-w-sm">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              reset()
              setQ(search.trim())
            }}
          >
            <Input
              aria-label="Search learners by name"
              type="search"
              value={search}
              placeholder="Search by name"
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </search>
        <Select
          aria-label="Show"
          value={status}
          onChange={(e) => {
            reset()
            setStatus(e.target.value as Status)
          }}
          className="w-full sm:w-48"
        >
          <option value="all">Everyone</option>
          <option value="active">Still learning</option>
          <option value="completed">Finished</option>
        </Select>
        {first.data ? (
          <p className="text-body-sm text-ink-2 sm:ml-auto">
            {first.data.total === 1 ? '1 learner' : `${first.data.total} learners`}
          </p>
        ) : null}
      </div>

      {first.isPending ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : first.error ? (
        <FormAlert tone="error">{apiErrorMessage(first.error)}</FormAlert>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-8">
          <p className="text-body text-ink-2">
            {q || status !== 'all'
              ? 'No learners match this filter.'
              : 'No learners yet. When someone enrolls, you’ll see them here with how far they’ve got.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <Table>
            <TableCaption className="sr-only">Learners in this course</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead className="min-w-40">Progress</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Cohort</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.enrollmentId}>
                  <TableCell>
                    <span className="font-medium text-ink">{l.displayName}</span>
                    {l.status !== 'active' ? (
                      <span className="block text-caption text-ink-3">{statusText[l.status]}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(l.enrolledAt)}</TableCell>
                  <TableCell>
                    <Progress value={l.progressPct} label={`${l.displayName} progress`} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.lastActiveAt ? formatDate(l.lastActiveAt) : 'Not started'}
                  </TableCell>
                  <TableCell className="text-ink-3">None</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {moreError ? <FormAlert tone="error">{moreError}</FormAlert> : null}
      {next ? (
        <div>
          <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
            Show more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
