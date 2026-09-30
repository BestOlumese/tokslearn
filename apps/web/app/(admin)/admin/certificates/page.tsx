import * as certificates from '@tokslearn/core/certificates'
import { hasRole, isUser } from '@tokslearn/core/kernel'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
import { Skeleton } from '@tokslearn/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tokslearn/ui/table'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { CertificateStatusAction } from '@/components/admin/certificate-status-action'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Certificates' }

type Search = Promise<{ q?: string }>
const basisLabel = { completion: 'Finished', exam: 'Exam', external: 'Outside exam' } as const

// docs/20 §6 `/admin/certificates`: find by code or learner, revoke or restore with a reason.
// Support can look; admins can change.
export default function AdminCertificatesPage({ searchParams }: { searchParams: Search }) {
  return (
    <div>
      <AdminPageHeader
        title="Certificates"
        description="Find a certificate by its code, or by the learner's email or name."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-72 w-full rounded-card" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Results({ searchParams }: { searchParams: Search }) {
  const q = (await searchParams).q?.trim().slice(0, 100) ?? ''
  const path = '/admin/certificates'
  const ctx = await requireSignedInCtx(path)
  let items: certificates.AdminCertificate[] = []
  try {
    items = q.length >= 2 ? await certificates.searchCertificates(ctx, q) : []
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  const canChange = isUser(ctx.actor) && hasRole(ctx.actor, 'admin', 'super_admin')
  return (
    <>
      <form action={path} aria-label="Search certificates" className="flex gap-3">
        <label htmlFor="q" className="sr-only">
          Code, email or name
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          minLength={2}
          defaultValue={q}
          placeholder="TL-C-8Q2M-4K7P or amaka@example.com"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
          Search
        </button>
      </form>
      <div className="mt-5">
        {q.length < 2 ? (
          <p className="text-body text-ink-2">Search to see certificates.</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No certificates match"
            description="Check the code, or search by the learner's email address."
          />
        ) : (
          <Table>
            <TableCaption>Certificates, newest first (up to 50)</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Learner</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Status</TableHead>
                {canChange ? <TableHead className="sr-only">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/verify/${c.code}` as Route}
                      className="font-mono text-brand underline-offset-4 hover:underline"
                    >
                      {c.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.recipientName}
                    <div className="text-ink-3">{c.email}</div>
                  </TableCell>
                  <TableCell>
                    {c.courseTitle}
                    <div className="text-ink-3">{basisLabel[c.basis]}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(c.issuedAt)}</TableCell>
                  <TableCell>
                    {c.status === 'revoked' ? (
                      <>
                        <Badge tone="danger">Revoked</Badge>
                        {c.revokedReason ? (
                          <div className="mt-1 max-w-64 text-ink-3">{c.revokedReason}</div>
                        ) : null}
                      </>
                    ) : (
                      <Badge tone="brand">Valid</Badge>
                    )}
                  </TableCell>
                  {canChange ? (
                    <TableCell className="text-right">
                      <CertificateStatusAction
                        certificateId={c.id}
                        code={c.code}
                        status={c.status}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  )
}
