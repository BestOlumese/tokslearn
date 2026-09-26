'use client'
// Client component: data export and account deletion requests (NDPA, docs/14 §3).

import { useMutation } from '@tanstack/react-query'
import { Button } from '@tokslearn/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@tokslearn/ui/dialog'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'

const lagosDate = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function PrivacySettings({ deletionScheduledFor }: { deletionScheduledFor: string | null }) {
  const [scheduled, setScheduled] = useState(deletionScheduledFor)
  const [exportQueued, setExportQueued] = useState(false)
  const exportData = useMutation(
    orpc.me.exportData.mutationOptions({ onSuccess: () => setExportQueued(true) }),
  )
  const requestDeletion = useMutation(
    orpc.me.requestDeletion.mutationOptions({ onSuccess: (r) => setScheduled(r.scheduledFor) }),
  )
  const cancelDeletion = useMutation(
    orpc.me.cancelDeletion.mutationOptions({ onSuccess: () => setScheduled(null) }),
  )

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="export-title">
        <h2 id="export-title" className="text-h2 text-ink">
          Get a copy of your data
        </h2>
        <p className="mt-1 text-body text-ink-2">
          Your profile, orders, progress and certificates as files you can keep. We email you a
          download link when it's ready.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {exportData.isError ? (
            <FormAlert tone="error">{apiErrorMessage(exportData.error)}</FormAlert>
          ) : null}
          {exportQueued ? (
            <FormAlert tone="success">
              We've started your export. You'll get an email when it's ready.
            </FormAlert>
          ) : (
            <Button
              variant="secondary"
              className="self-start"
              loading={exportData.isPending}
              onClick={() => exportData.mutate({})}
            >
              Request my data
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="delete-title">
        <h2 id="delete-title" className="text-h2 text-ink">
          Delete your account
        </h2>
        {scheduled ? (
          <div className="mt-4 flex flex-col gap-3">
            <FormAlert tone="error">
              Your account will be deleted on {lagosDate.format(new Date(scheduled))}. Until then
              you can cancel and keep everything.
            </FormAlert>
            {cancelDeletion.isError ? (
              <FormAlert tone="error">{apiErrorMessage(cancelDeletion.error)}</FormAlert>
            ) : null}
            <Button
              className="self-start"
              loading={cancelDeletion.isPending}
              onClick={() => cancelDeletion.mutate({})}
            >
              Keep my account
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-4">
            <p className="text-body text-ink-2">
              We wait 14 days before deleting, so you can change your mind. After that we remove
              your name, email, photo, profile, notes and sign-in details. Receipts and payment
              records stay, without your name, because the law requires us to keep them.
            </p>
            {requestDeletion.isError ? (
              <FormAlert tone="error">{apiErrorMessage(requestDeletion.error)}</FormAlert>
            ) : null}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="danger" className="self-start">
                  Delete my account
                </Button>
              </DialogTrigger>
              <DialogContent
                title="Delete your account?"
                description="Deletion happens in 14 days. You'll lose access to your courses and certificates after that. We'll email you a link to cancel."
              >
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Keep my account</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger" onClick={() => requestDeletion.mutate({})}>
                      Delete in 14 days
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </section>
    </div>
  )
}
