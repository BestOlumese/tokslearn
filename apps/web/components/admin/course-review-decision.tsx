'use client'
// Client component: reviewer checklist (docs/25 §B) and the decision. Approving needs every item
// ticked; requesting changes needs notes that cite the item or rule.

import type { ReviewDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Label } from '@tokslearn/ui/label'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

type Key = ReviewDto['checklistKeys'][number]
const labels: Readonly<Record<Key, string>> = {
  rights: 'Rights: no copied content (spot-checked 3 videos)',
  rules: 'Content rules 1–10: none broken',
  quality: 'Quality: audible audio, readable screens (sampled start, middle, end)',
  accuracy: 'Title, description, outcomes and certificate claims match the content',
  price: 'Price is reasonable for the content',
  previews: 'Preview lessons are representative',
  resources: 'Files are safe (no executables) and open correctly',
}

export function CourseReviewDecision({ review }: { review: ReviewDto }) {
  const router = useRouter()
  const [ticked, setTicked] = useState<Partial<Record<Key, boolean>>>({})
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'approve' | 'request_changes' | null>(null)
  const allTicked = review.checklistKeys.every((k) => ticked[k])

  const decide = async (decision: 'approve' | 'request_changes') => {
    setError(null)
    setPending(decision)
    try {
      await api.admin.courseReviews.decide({
        revisionId: review.revisionId,
        decision,
        notes,
        checklist: ticked,
      })
      router.refresh()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <SettingsPanel
      id="decision"
      title="Your decision"
      description="The instructor reads your notes. For changes, say what to fix and cite the checklist item or rule number."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            loading={pending === 'request_changes'}
            disabled={notes.trim().length < 10 || pending !== null}
            onClick={() => decide('request_changes')}
          >
            Request changes
          </Button>
          <Button
            loading={pending === 'approve'}
            disabled={!allTicked || notes.trim().length < 3 || pending !== null}
            onClick={() => decide('approve')}
          >
            Approve and publish
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-body-sm font-medium text-ink">Checklist</legend>
          {review.checklistKeys.map((k) => (
            <div key={k} className="flex items-start gap-3">
              <Checkbox
                id={`check-${k}`}
                checked={Boolean(ticked[k])}
                onChange={(e) => setTicked((t) => ({ ...t, [k]: e.target.checked }))}
                className="mt-0.5"
              />
              <Label htmlFor={`check-${k}`} kind="option">
                {labels[k]}
              </Label>
            </div>
          ))}
        </fieldset>
        <Field id="notes" label="Notes" helper="Saved with the course and in the audit log.">
          {(p) => (
            <Textarea
              rows={5}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              {...p}
            />
          )}
        </Field>
      </div>
    </SettingsPanel>
  )
}
