import * as admin from '@tokslearn/core/admin'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tokslearn/ui/table'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Background jobs' }

// docs/20 §6 `/admin/jobs` (admin): what our database knows about background work (ADR-047).
// Each job's own runs and retries are in the Inngest dashboard.
export default function AdminJobsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Background jobs"
        description={
          <>
            Events waiting to reach the job runner, and provider notifications that failed. Each
            job’s runs and retries are in the{' '}
            <a
              href="https://app.inngest.com"
              target="_blank"
              rel="noreferrer"
              className="text-brand-ink underline underline-offset-4"
            >
              Inngest dashboard
            </a>
            .
          </>
        }
      />
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}>
        <Status />
      </Suspense>
    </div>
  )
}

async function Status() {
  const path = '/admin/jobs'
  const ctx = await requireSignedInCtx(path)
  let s: admin.SystemStatus
  try {
    s = await admin.systemStatus(ctx)
  } catch (error) {
    return staffErrorState(error, path)
  }
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Waiting to send"
          value={s.outbox.pending}
          note={
            s.outbox.oldestPendingAt
              ? `Oldest from ${formatDateTime(s.outbox.oldestPendingAt)}`
              : 'Nothing waiting'
          }
        />
        <Stat label="Stuck over 15 minutes" value={s.outbox.stale} note="Should be 0" />
        <Stat label="Failed for good" value={s.outbox.failed} note="Gave up after 8 tries" />
        <Stat
          label="Provider notifications"
          value={s.webhooks.failed + s.webhooks.stale}
          note={`${s.webhooks.failed} failed, ${s.webhooks.stale} waiting`}
        />
      </dl>

      <section aria-labelledby="outbox-title">
        <h2 id="outbox-title" className="text-h3 text-ink">
          Events that failed
        </h2>
        {s.failedOutbox.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink-2">None.</p>
        ) : (
          <div className="relative mt-3 overflow-x-auto rounded-card border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Tries</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.failedOutbox.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.eventName}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.attempts}</TableCell>
                    <TableCell className="min-w-48 text-body-sm text-ink-2">
                      {o.lastError ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(o.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="webhooks-title">
        <h2 id="webhooks-title" className="text-h3 text-ink">
          Provider notifications that failed or are waiting
        </h2>
        {s.failedWebhooks.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink-2">None.</p>
        ) : (
          <div className="relative mt-3 overflow-x-auto rounded-card border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.failedWebhooks.map((w) => (
                  <TableRow key={`${w.provider}:${w.eventId}`}>
                    <TableCell className="capitalize">{w.provider}</TableCell>
                    <TableCell className="font-mono">{w.type}</TableCell>
                    <TableCell className="min-w-48 text-body-sm text-ink-2">
                      {w.error ?? 'Not handled after 15 minutes'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(w.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-h2 text-ink tabular-nums">{value.toLocaleString('en-NG')}</dd>
      <dd className="mt-1 text-body-sm text-ink-2">{note}</dd>
    </div>
  )
}
