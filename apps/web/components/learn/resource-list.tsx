'use client'
// Client component: lesson files with download buttons (docs/20 resource lesson). An important
// file on a purchase that can still be refunded asks first, because downloading it ends the
// refund right (docs/08 §7). The server enforces this too.

import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { formatBytes } from '@/lib/format'
import { downloadFile, LearnError } from '@/lib/learn-api'

export interface ResourceView {
  id: string
  title: string
  filename: string
  mime: string
  sizeBytes: number
  isImportant: boolean
}

const kind = (filename: string) => filename.split('.').pop()?.toUpperCase() ?? 'File'

export function ResourceList({
  lessonId,
  resources,
  refundable,
}: {
  lessonId: string
  resources: ResourceView[]
  refundable: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<ResourceView | null>(null)

  const download = async (r: ResourceView, confirmed: boolean) => {
    setBusy(r.id)
    setError(null)
    try {
      const file = await downloadFile(lessonId, r.id, confirmed)
      setAsking(null)
      window.location.assign(file.url)
    } catch (e) {
      if (e instanceof LearnError && e.code === 'DOWNLOAD_CONFIRM_REQUIRED') setAsking(r)
      else setError(e instanceof LearnError ? e.message : 'The download didn’t start. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {resources.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-ink">{r.title}</p>
              <p className="text-body-sm text-ink-2">
                {kind(r.filename)} · {formatBytes(r.sizeBytes)}
                {r.isImportant && refundable ? ' · Ends your refund window' : ''}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Download aria-hidden />}
              loading={busy === r.id}
              aria-label={`Download ${r.title}`}
              onClick={() => (r.isImportant && refundable ? setAsking(r) : void download(r, false))}
            >
              Download
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={asking !== null} onOpenChange={(open) => (open ? null : setAsking(null))}>
        <DialogContent
          title="Download and keep this course?"
          description={`“${asking?.title ?? ''}” is one of the course’s main files. Once you download it, you can’t ask for a refund for this course.`}
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Not now
            </Button>
            <Button
              loading={asking !== null && busy === asking.id}
              onClick={() => (asking ? void download(asking, true) : undefined)}
            >
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
