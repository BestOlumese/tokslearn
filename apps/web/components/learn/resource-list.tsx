'use client'
// Client component: lesson files with download buttons (docs/20 resource lesson). An important
// file on a purchase that can still be refunded asks first, because downloading it ends the
// refund right (docs/08 §7). The server enforces this too.

import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatBytes, formatDayMonth } from '@/lib/format'
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

export type RefundView = { state: 'open'; until: Date } | { state: 'ended' } | null

export function ResourceList({
  lessonId,
  resources,
  refund,
}: {
  lessonId: string
  resources: ResourceView[]
  /** The learner's refund right on this course; null for free courses and staff. */
  refund: RefundView
}) {
  const refundable = refund?.state === 'open'
  const hasMain = resources.some((r) => r.isImportant)
  const router = useRouter()
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
      // The download completes a file lesson and may end the refund window: redraw both.
      router.refresh()
    } catch (e) {
      if (e instanceof LearnError && e.code === 'DOWNLOAD_CONFIRM_REQUIRED') setAsking(r)
      else setError(e instanceof LearnError ? e.message : 'The download didn’t start. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {hasMain && refund?.state === 'open' ? (
        <p className="text-body-sm text-ink-2">
          You can ask for a refund until {formatDayMonth(refund.until)}. Downloading a main file
          ends that, so we ask first.
        </p>
      ) : null}
      {hasMain && refund?.state === 'ended' ? (
        <p className="text-body-sm text-ink-2">
          The refund window for this course has ended, so main files download straight away.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {resources.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="truncate text-body font-medium text-ink">{r.title}</span>
                {r.isImportant ? <Badge tone="accent">Main file</Badge> : null}
              </p>
              <p className="text-body-sm text-ink-2">
                {kind(r.filename)} · {formatBytes(r.sizeBytes)}
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
