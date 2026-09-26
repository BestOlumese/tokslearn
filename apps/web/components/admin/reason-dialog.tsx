'use client'
// Client component: every destructive or staff action asks for a reason that goes to the audit
// log (docs/20 §6).

import { Button, type ButtonVariant } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@tokslearn/ui/dialog'
import { Field } from '@tokslearn/ui/field'
import { Textarea } from '@tokslearn/ui/textarea'
import { type ReactNode, useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'

export function ReasonDialog({
  trigger,
  triggerLabel,
  triggerVariant = 'secondary',
  title,
  description,
  confirmLabel,
  confirmVariant = 'primary',
  minLength = 3,
  maxLength = 500,
  reasonHelper = 'Saved in the audit log with your name.',
  onConfirm,
}: {
  trigger: ReactNode
  /** Full name for screen readers when the visible label is short, e.g. "Grant Instructor". */
  triggerLabel?: string
  triggerVariant?: ButtonVariant
  title: string
  description: string
  confirmLabel: string
  confirmVariant?: ButtonVariant
  minLength?: number
  maxLength?: number
  reasonHelper?: string
  /** Resolves to an error message, or null on success. */
  onConfirm: (reason: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size="sm"
          {...(triggerLabel ? { 'aria-label': triggerLabel } : {})}
        >
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            const result = await onConfirm(
              String(new FormData(e.currentTarget).get('reason') ?? '').trim(),
            )
            setPending(false)
            if (result) setError(result)
            else setOpen(false)
          }}
        >
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <Field id="reason" label="Reason" helper={reasonHelper}>
            {(p) => (
              <Textarea
                name="reason"
                rows={3}
                required
                minLength={minLength}
                maxLength={maxLength}
                {...p}
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={confirmVariant} loading={pending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
