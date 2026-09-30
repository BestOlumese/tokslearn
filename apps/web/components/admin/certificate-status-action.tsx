'use client'
// Client component: revoke or restore one certificate, with the reason (docs/20
// `/admin/certificates`). Both are audit-logged; the check page updates at once.

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Label } from '@tokslearn/ui/label'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function CertificateStatusAction({
  certificateId,
  code,
  status,
}: {
  certificateId: string
  code: string
  status: 'active' | 'revoked'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const revoke = status === 'active'
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {revoke ? 'Revoke' : 'Restore'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={revoke ? `Revoke ${code}?` : `Restore ${code}?`}
          description={
            revoke
              ? 'The check page will say it was revoked, with this reason. The learner can no longer download it.'
              : 'The certificate becomes valid again. The reason goes to the audit log, not the check page.'
          }
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setPending(true)
              setError(null)
              try {
                const input = { certificateId, reason }
                if (revoke) await api.admin.certificates.revoke(input)
                else await api.admin.certificates.restore(input)
                setOpen(false)
                setReason('')
                router.refresh()
              } catch (err) {
                setError(apiErrorMessage(err))
              } finally {
                setPending(false)
              }
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`reason-${certificateId}`}>
                {revoke ? 'Reason (shown publicly)' : 'Reason (for the audit log)'}
              </Label>
              <Textarea
                id={`reason-${certificateId}`}
                value={reason}
                required
                minLength={5}
                maxLength={500}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error ? <FormAlert tone="error">{error}</FormAlert> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant={revoke ? 'danger' : 'primary'} loading={pending}>
                {revoke ? 'Revoke' : 'Restore'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
