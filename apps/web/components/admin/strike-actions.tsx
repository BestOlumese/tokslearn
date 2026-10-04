'use client'
// Client component: record a content-policy strike, or revoke one (docs/25 §A, ADR-047). The
// server checks roles and writes the audit log; the instructor is told about a new strike.

import { Button } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Select } from '@tokslearn/ui/select'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorDetails } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function IssueStrikeForm({
  instructorId,
  courses,
}: {
  instructorId: string
  courses: ReadonlyArray<{ id: string; title: string }>
}) {
  const router = useRouter()
  const [rule, setRule] = useState('')
  const [reason, setReason] = useState('')
  const [courseId, setCourseId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.admin.instructors.issueStrike({
        instructorId,
        rule,
        reason,
        ...(courseId ? { courseId } : {}),
      })
      setRule('')
      setReason('')
      setCourseId('')
      router.refresh()
    } catch (err) {
      setError(apiErrorDetails(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="strike-rule">Rule broken</Label>
          <Input
            id="strike-rule"
            value={rule}
            maxLength={80}
            placeholder="A3 Rights"
            onChange={(e) => setRule(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="strike-course">Course (optional)</Label>
          <Select id="strike-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Not about one course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="strike-reason">What happened (the instructor reads this)</Label>
        <Textarea
          id="strike-reason"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <Button
        type="submit"
        variant="danger"
        className="self-start"
        loading={saving}
        disabled={rule.trim().length < 2 || reason.trim().length < 10}
      >
        Record strike
      </Button>
    </form>
  )
}

export function RevokeStrike({ strikeId }: { strikeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) {
    return (
      <Button size="sm" variant="tertiary" className="self-start" onClick={() => setOpen(true)}>
        Revoke strike
      </Button>
    )
  }
  return (
    <div className="flex w-full flex-col gap-2 sm:max-w-sm">
      <Label htmlFor={`revoke-${strikeId}`}>Why it’s revoked</Label>
      <Textarea
        id={`revoke-${strikeId}`}
        rows={2}
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={saving}
          disabled={reason.trim().length < 3}
          onClick={async () => {
            setSaving(true)
            setError(null)
            try {
              await api.admin.instructors.revokeStrike({ strikeId, reason })
              router.refresh()
            } catch (err) {
              setError(apiErrorDetails(err))
            } finally {
              setSaving(false)
            }
          }}
        >
          Revoke strike
        </Button>
        <Button size="sm" variant="tertiary" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </div>
  )
}
