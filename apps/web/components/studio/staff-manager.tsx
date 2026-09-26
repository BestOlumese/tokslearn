'use client'
// Client component: teaching assistants for one course (docs/20 staff).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'
import { useCourseEditor } from './course-editor-provider'

export function StaffManager() {
  const { course } = useCourseEditor()
  const client = useQueryClient()
  const key = orpc.studio.staff.list.queryKey({ input: { courseId: course.id } })
  const staff = useQuery(orpc.studio.staff.list.queryOptions({ input: { courseId: course.id } }))
  const [error, setError] = useState<string | null>(null)
  const [who, setWho] = useState('')
  const onSuccess = (rows: NonNullable<typeof staff.data>) => {
    client.setQueryData(key, rows)
    setError(null)
  }
  const add = useMutation(
    orpc.studio.staff.add.mutationOptions({
      onSuccess: (rows) => {
        onSuccess(rows)
        setWho('')
      },
      onError: (e) => setError(apiErrorMessage(e)),
    }),
  )
  const remove = useMutation(
    orpc.studio.staff.remove.mutationOptions({
      onSuccess,
      onError: (e) => setError(apiErrorMessage(e)),
    }),
  )

  return (
    <div className="flex max-w-[780px] flex-col gap-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <SettingsPanel
        id="staff"
        title="Teaching assistants"
        description="Assistants help grade assignments and answer questions once those arrive. They can open this course in the studio but can't change it, its price or its payouts."
      >
        {staff.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : staff.data && staff.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-card border border-border">
            {staff.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{s.name}</p>
                  {s.username ? <p className="text-body-sm text-ink-3">@{s.username}</p> : null}
                </div>
                {course.canEdit ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={remove.isPending && remove.variables?.staffId === s.id}
                    onClick={() => remove.mutate({ courseId: course.id, staffId: s.id })}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-2">No assistants yet.</p>
        )}
      </SettingsPanel>
      {course.canEdit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate({ courseId: course.id, emailOrUsername: who })
          }}
        >
          <SettingsPanel
            id="add-staff"
            title="Add an assistant"
            description="They need a Tokslearn account. We don't email them yet; tell them yourself."
            footer={
              <Button type="submit" loading={add.isPending} disabled={who.trim().length < 2}>
                Add assistant
              </Button>
            }
          >
            <Field id="who" label="Email or username">
              {(p) => (
                <Input
                  value={who}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={200}
                  onChange={(e) => setWho(e.target.value)}
                  {...p}
                />
              )}
            </Field>
          </SettingsPanel>
        </form>
      ) : null}
    </div>
  )
}
