'use client'
// Client component: certificates issued for the course, with search and revoke (docs/20). Learners
// appear by first name and last initial; revoking needs a reason, which the check page shows.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { IssuedCertificateDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Textarea } from '@tokslearn/ui/textarea'
import type { Route } from 'next'
import Link from 'next/link'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { api, orpc } from '@/lib/orpc'

const basisLabel = { completion: 'Finished', exam: 'Exam', external: 'Outside exam' } as const

export function IssuedCertificates({ courseId, canEdit }: { courseId: string; canEdit: boolean }) {
  const client = useQueryClient()
  const [q, setQ] = useState('')
  const search = q.trim().length >= 2 ? q.trim() : undefined
  const list = useQuery(
    orpc.studio.certificates.list.queryOptions({
      input: { courseId, ...(search ? { q: search } : {}) },
    }),
  )
  const [revoking, setRevoking] = useState<IssuedCertificateDto | null>(null)

  return (
    <SettingsPanel
      id="issued"
      title="Issued certificates"
      description="Newest first. Each one has a public check page anyone can open with its code."
    >
      <div className="flex flex-col gap-4">
        <div className="flex max-w-md flex-col gap-1.5">
          <Label htmlFor="issued-search">Search by name or code</Label>
          <Input
            id="issued-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Chiamaka or TL-C-8Q2M-4K7P"
          />
        </div>
        {list.isPending ? (
          <div className="h-24 animate-pulse rounded-control bg-surface-sunken" />
        ) : list.error ? (
          <FormAlert tone="error">{apiErrorMessage(list.error)}</FormAlert>
        ) : list.data.items.length === 0 ? (
          <p className="text-body text-ink-2">
            {search
              ? 'No certificates match that search.'
              : 'None yet. They appear here as learners meet the rules above.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {list.data.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-body text-ink">
                    {c.learnerName}
                    {c.status === 'revoked' ? <Badge tone="danger">Revoked</Badge> : null}
                  </p>
                  <p className="text-body-sm text-ink-2">
                    {basisLabel[c.basis]} · {formatDate(c.issuedAt)} ·{' '}
                    <Link
                      href={`/verify/${c.code}` as Route}
                      className="font-mono text-brand-ink hover:underline"
                    >
                      {c.code}
                    </Link>
                  </p>
                  {c.revokedReason ? (
                    <p className="text-body-sm text-ink-2">Reason: {c.revokedReason}</p>
                  ) : null}
                </div>
                {canEdit && c.status === 'active' ? (
                  <Button size="sm" variant="secondary" onClick={() => setRevoking(c)}>
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <RevokeDialog
        cert={revoking}
        onClose={() => setRevoking(null)}
        onDone={() => client.invalidateQueries({ queryKey: orpc.studio.certificates.list.key() })}
      />
    </SettingsPanel>
  )
}

function RevokeDialog({
  cert,
  onClose,
  onDone,
}: {
  cert: IssuedCertificateDto | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      open={cert !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setReason('')
          setError(null)
        }
      }}
    >
      <DialogContent
        title={`Revoke ${cert?.learnerName ?? ''}’s certificate?`}
        description="The check page will say it was revoked, with your reason, and the learner can no longer download it. Only Tokslearn staff can restore it."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!cert) return
            setPending(true)
            setError(null)
            try {
              await api.studio.certificates.revoke({ certificateId: cert.id, reason })
              await onDone()
              onClose()
              setReason('')
            } catch (err) {
              setError(apiErrorMessage(err))
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="revoke-reason">Reason (shown publicly)</Label>
            <Textarea
              id="revoke-reason"
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
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Revoke
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
