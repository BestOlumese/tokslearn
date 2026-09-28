'use client'
// Client component: change the default rate for one attribution source (super admin, audited).

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@tokslearn/ui/dialog'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

type Source = 'instructor_referral' | 'instructor_coupon' | 'platform_organic' | 'platform_paid'

export function CommissionDefaultDialog({
  source,
  label,
  currentBps,
}: {
  source: Source
  label: string
  currentBps: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" aria-label={`Change the rate for ${label}`}>
          Change
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Default rate: ${label}`}
        description="Applies to orders from now on. Orders already placed keep the rate they were sold at."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const pct = Number(f.get('rate'))
            setPending(true)
            setError(null)
            try {
              await api.admin.commission.setDefault({
                source,
                platformRateBps: Math.round(pct * 100),
                note: String(f.get('note') ?? '').trim(),
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
          <Field
            id={`rate-${source}`}
            label="Tokslearn's share (%)"
            helper={`Now ${currentBps / 100}%. The instructor gets the rest, less their part of the Paystack fee.`}
          >
            {(p) => (
              <Input
                name="rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                required
                defaultValue={currentBps / 100}
                {...p}
              />
            )}
          </Field>
          <Field
            id={`note-${source}`}
            label="Reason"
            helper="Saved in the audit log with your name."
          >
            {(p) => <Textarea name="note" rows={2} required minLength={3} maxLength={500} {...p} />}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save new rate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
