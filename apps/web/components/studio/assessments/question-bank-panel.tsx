'use client'
// Client component: one question bank — its questions, and adding, editing or archiving them.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QuestionBankDto, QuestionDto, QuestionType } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Select } from '@tokslearn/ui/select'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { RichHtml } from '@/components/rich-html'
import { apiErrorMessage } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'
import { ConfirmDialog } from '../confirm-dialog'
import { QuestionEditor, typeLabels } from './question-editor'

export function QuestionBankPanel({ bank, canEdit }: { bank: QuestionBankDto; canEdit: boolean }) {
  const client = useQueryClient()
  const key = orpc.studio.questions.list.queryKey({ input: { bankId: bank.id } })
  const list = useQuery(orpc.studio.questions.list.queryOptions({ input: { bankId: bank.id } }))
  const [editing, setEditing] = useState<{
    type: QuestionType
    question: QuestionDto | null
  } | null>(null)
  const [newType, setNewType] = useState<QuestionType>('single')
  const [archiving, setArchiving] = useState<QuestionDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => {
    void client.invalidateQueries({ queryKey: key })
    void client.invalidateQueries({ queryKey: orpc.studio.questionBanks.list.key() })
  }
  const archive = useMutation({
    mutationFn: (q: QuestionDto) => api.studio.questions.archive({ questionId: q.id }),
    onSuccess: refresh,
    onError: (e) => setError(apiErrorMessage(e)),
  })

  if (editing) {
    return (
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h3 className="text-h4 text-ink">
          {editing.question ? 'Edit question' : 'New question'} · {typeLabels[editing.type]}
        </h3>
        <QuestionEditor
          bankId={bank.id}
          type={editing.type}
          question={editing.question}
          disabled={!canEdit}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Question type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as QuestionType)}
            className="w-56"
          >
            {(Object.keys(typeLabels) as QuestionType[]).map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </Select>
          <Button onClick={() => setEditing({ type: newType, question: null })}>
            Add a question
          </Button>
        </div>
      ) : null}
      {list.isPending ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : list.data && list.data.length > 0 ? (
        <ol className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {list.data.map((q, i) => (
            <li
              key={q.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-caption text-ink-3">
                  {i + 1}. {typeLabels[q.type]} · {q.points} {q.points === 1 ? 'point' : 'points'}
                  {q.difficulty ? ` · ${q.difficulty}` : ''}
                </p>
                <RichHtml html={q.promptHtml} className="line-clamp-3 text-body text-ink" />
                {q.tags.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {q.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing({ type: q.type, question: q })}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="tertiary" onClick={() => setArchiving(q)}>
                    Archive
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-card border border-border bg-surface p-6 text-body text-ink-2">
          No questions in this bank yet. Add one above.
        </p>
      )}
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => (open ? null : setArchiving(null))}
        title="Archive this question?"
        description="It leaves every quiz that uses it. Past attempts keep it and their grades."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (archiving) await archive.mutateAsync(archiving)
        }}
      />
    </div>
  )
}
