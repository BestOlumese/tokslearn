'use client'
// Client component: asks before a studio action that can't be undone (remove a section, lesson
// or file; share a coupon).

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { useState } from 'react'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'danger',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  /** `primary` for confirmations that aren't destructive. */
  tone?: 'danger' | 'primary'
}) {
  const [pending, setPending] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={tone}
            loading={pending}
            onClick={async () => {
              setPending(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setPending(false)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
