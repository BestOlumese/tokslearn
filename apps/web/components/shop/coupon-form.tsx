'use client'
// Client component: create a coupon. Instructors make them for their own courses in the studio
// (studio.coupons.create); admins make platform coupons (admin.coupons.create).

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@tokslearn/ui/dialog'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Select } from '@tokslearn/ui/select'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

type Target = { id: string; title: string }

export function CouponForm({
  mode,
  courses,
  bundles,
}: {
  mode: 'studio' | 'admin'
  courses: ReadonlyArray<Target>
  bundles: ReadonlyArray<Target>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent')
  const [appliesTo, setAppliesTo] = useState<'course' | 'bundle' | 'instructor_all' | 'all'>(
    mode === 'studio' ? 'instructor_all' : 'all',
  )
  const scopes: ReadonlyArray<[typeof appliesTo, string]> =
    mode === 'studio'
      ? [
          ['instructor_all', 'All my courses'],
          ['course', 'One course'],
          ['bundle', 'One bundle'],
        ]
      : [
          ['all', 'Every course on Tokslearn'],
          ['course', 'One course'],
          ['bundle', 'One bundle'],
        ]
  const targets = appliesTo === 'course' ? courses : appliesTo === 'bundle' ? bundles : []

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">New coupon</Button>
      </DialogTrigger>
      <DialogContent
        title="New coupon"
        description={
          mode === 'studio'
            ? 'Share the code with your audience. Sales with it earn you 97%.'
            : 'The discount comes out of the platform’s share.'
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const text = (k: string) => String(f.get(k) ?? '').trim()
            const date = (k: string) =>
              text(k) ? new Date(`${text(k)}T00:00:00+01:00`).toISOString() : null
            const naira = Number(text('amount'))
            const input = {
              code: text('code'),
              kind,
              percentOff: kind === 'percent' ? Number(text('percent')) : null,
              amountOffKobo: kind === 'fixed' ? String(Math.round(naira * 100)) : null,
              appliesTo,
              targetId: targets.length ? text('target') || null : null,
              maxRedemptions: text('max') ? Number(text('max')) : null,
              perUserLimit: Number(text('perUser') || '1'),
              startsAt: date('starts'),
              endsAt: date('ends'),
            }
            setPending(true)
            setError(null)
            try {
              if (mode === 'studio') await api.studio.coupons.create(input)
              else await api.admin.coupons.create(input)
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
          <Field
            id="coupon-code"
            label="Code"
            helper="3 to 30 letters, numbers or dashes. Not case-sensitive."
          >
            {(p) => (
              <Input
                name="code"
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9-]+"
                autoComplete="off"
                spellCheck={false}
                {...p}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="coupon-kind" label="Discount type">
              {(p) => (
                <Select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                  {...p}
                >
                  <option value="percent">Percentage off</option>
                  <option value="fixed">Naira off</option>
                </Select>
              )}
            </Field>
            {kind === 'percent' ? (
              <Field id="coupon-percent" label="Percent off">
                {(p) => <Input name="percent" type="number" min={1} max={100} required {...p} />}
              </Field>
            ) : (
              <Field id="coupon-amount" label="Naira off">
                {(p) => <Input name="amount" type="number" min={1} step="0.01" required {...p} />}
              </Field>
            )}
          </div>
          <Field id="coupon-scope" label="Applies to">
            {(p) => (
              <Select
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value as typeof appliesTo)}
                {...p}
              >
                {scopes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {appliesTo === 'course' || appliesTo === 'bundle' ? (
            <Field id="coupon-target" label={appliesTo === 'course' ? 'Course' : 'Bundle'}>
              {(p) =>
                targets.length > 0 ? (
                  <Select name="target" required {...p}>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    name="target"
                    required
                    placeholder={`${appliesTo === 'course' ? 'Course' : 'Bundle'} id`}
                    {...p}
                  />
                )
              }
            </Field>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="coupon-max" label="Total uses" helper="Empty for no limit.">
              {(p) => <Input name="max" type="number" min={1} {...p} />}
            </Field>
            <Field id="coupon-per-user" label="Uses per learner">
              {(p) => (
                <Input name="perUser" type="number" min={1} max={100} defaultValue={1} {...p} />
              )}
            </Field>
            <Field id="coupon-starts" label="Starts" helper="Optional.">
              {(p) => <Input name="starts" type="date" {...p} />}
            </Field>
            <Field id="coupon-ends" label="Ends" helper="Optional. Ends at midnight, Lagos time.">
              {(p) => <Input name="ends" type="date" {...p} />}
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create coupon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
