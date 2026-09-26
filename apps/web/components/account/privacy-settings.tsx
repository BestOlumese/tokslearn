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
import { SettingsPanel } from './settings-panel'

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
    <>
      <SettingsPanel
        id="export"
        title="Download your data"
        description="Your profile, orders, progress and certificates in files you can keep. We email you a link when it's ready."
        footer={
          exportQueued ? null : (
            <Button
              variant="secondary"
              loading={exportData.isPending}
              onClick={() => exportData.mutate({})}
            >
              Request my data
            </Button>
          )
        }
      >
        {exportData.isError ? (
          <FormAlert tone="error">{apiErrorMessage(exportData.error)}</FormAlert>
        ) : null}
        {exportQueued ? (
          <FormAlert tone="success">
            Your export has started. We'll email you when it's ready.
          </FormAlert>
        ) : null}
      </SettingsPanel>

      <SettingsPanel
        id="delete"
        tone="danger"
        title="Delete your account"
        description={
          scheduled
            ? undefined
            : 'We wait 14 days before deleting anything, so you can change your mind.'
        }
        footer={
          scheduled ? (
            <Button loading={cancelDeletion.isPending} onClick={() => cancelDeletion.mutate({})}>
              Keep my account
            </Button>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="danger">Delete my account</Button>
              </DialogTrigger>
              <DialogContent
                title="Delete your account?"
                description="We'll delete it in 14 days. After that you lose your courses and certificates. We'll email you a link to cancel."
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
          )
        }
      >
        <div className="flex flex-col gap-4">
          {scheduled ? (
            <FormAlert tone="error">
              Your account will be deleted on {lagosDate.format(new Date(scheduled))}. Until then
              you can cancel and keep everything.
            </FormAlert>
          ) : null}
          <dl className="grid gap-4 text-body-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-ink">What we delete</dt>
              <dd className="mt-1 text-ink-2">
                Your name, email, photo, profile, notes and sign-in details.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">What we keep</dt>
              <dd className="mt-1 text-ink-2">
                Receipts and payment records, without your name. The law requires us to keep them.
              </dd>
            </div>
          </dl>
          {requestDeletion.isError ? (
            <FormAlert tone="error">{apiErrorMessage(requestDeletion.error)}</FormAlert>
          ) : null}
          {cancelDeletion.isError ? (
            <FormAlert tone="error">{apiErrorMessage(cancelDeletion.error)}</FormAlert>
          ) : null}
        </div>
      </SettingsPanel>
    </>
  )
}
