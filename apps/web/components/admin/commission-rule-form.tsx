'use client'
// Client component: add an instructor override or a dated promo rate (super admin, audited).

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@tokslearn/ui/dialog'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Select } from '@tokslearn/ui/select'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

const sources = [
  ['platform_organic', 'Tokslearn sales'],
  ['platform_paid', 'Tokslearn ads'],
  ['instructor_referral', 'Instructor links'],
  ['instructor_coupon', 'Instructor coupons'],
] as const

export function CommissionRuleForm({
  instructors,
}: {
  instructors: ReadonlyArray<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'instructor' | 'promo'>('instructor')
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Add override or promo</Button>
      </DialogTrigger>
      <DialogContent
        title="Instructor rate"
        description="An override replaces the default for one instructor. A promo runs between two dates and wins over both."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const text = (k: string) => String(f.get(k) ?? '').trim()
            const date = (k: string) =>
              text(k) ? new Date(`${text(k)}T00:00:00+01:00`).toISOString() : null
            setPending(true)
            setError(null)
            try {
              await api.admin.commission.addRule({
                scope,
                instructorId: text('instructor'),
                source: text('source') as (typeof sources)[number][0],
                platformRateBps: Math.round(Number(text('rate')) * 100),
                startsAt: date('starts'),
                endsAt: date('ends'),
                note: text('note'),
              })
              setOpen(false)
              router.refresh()
            } catch (err) {
              setError(apiErrorMessage(err))
            } finally {
              setPending(false)
            }
          }}
        >
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <Field id="rule-scope" label="Kind">
            {(p) => (
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                {...p}
              >
                <option value="instructor">Override (until ended)</option>
                <option value="promo">Promo (between dates)</option>
              </Select>
            )}
          </Field>
          <Field id="rule-instructor" label="Instructor">
            {(p) => (
              <Select name="instructor" required {...p}>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="rule-source" label="For sales from">
              {(p) => (
                <Select name="source" {...p}>
                  {sources.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="rule-rate" label="Tokslearn's share (%)">
              {(p) => (
                <Input name="rate" type="number" min={0} max={100} step="0.01" required {...p} />
              )}
            </Field>
            <Field id="rule-starts" label="Starts" helper="Empty: now.">
              {(p) => <Input name="starts" type="date" {...p} />}
            </Field>
            <Field
              id="rule-ends"
              label="Ends"
              helper={scope === 'promo' ? 'Required for a promo.' : 'Optional.'}
            >
              {(p) => <Input name="ends" type="date" required={scope === 'promo'} {...p} />}
            </Field>
          </div>
          <Field id="rule-note" label="Reason" helper="Saved in the audit log with your name.">
            {(p) => <Textarea name="note" rows={2} required minLength={3} maxLength={500} {...p} />}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add rate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
