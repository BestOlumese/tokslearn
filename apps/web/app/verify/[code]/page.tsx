import type { PublicCertificateDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { permanentRedirect } from 'next/navigation'
import { after, connection } from 'next/server'
import { Suspense } from 'react'
import { JsonLd } from '@/components/seo/json-ld'
import { PageHeader } from '@/components/site/page-header'
import { QrCode } from '@/components/site/qr-code'
import { env } from '@/env'
import {
  getPublicCertificate,
  normaliseCertificateCode,
  recordCertificateView,
} from '@/lib/certificate-data'
import { formatDate } from '@/lib/format'

type Params = Promise<{ code: string }>

// docs/20 §1 `/verify/[code]`: cached per code, tagged `certificate:{code}`, so a revocation shows
// within seconds. Unknown codes are a 200 "No certificate found" page, never indexed. Valid ones
// aren't indexed either (ADR-036): a learner shares the link, search engines don't list people.

/** Cache Components needs one param at build time; real codes render on first visit. */
export function generateStaticParams() {
  return [{ code: 'TL-C-0000-0000' }]
}

const codeFrom = async (params: Params) =>
  normaliseCertificateCode(decodeURIComponent((await params).code).slice(0, 40))

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const code = await codeFrom(params)
  const cert = code ? await getPublicCertificate(code) : null
  if (!cert) return { title: 'Certificate check', robots: { index: false } }
  const description = `${cert.recipientName}: ${cert.basisText.toLowerCase()} in ${cert.courseTitle}, taught by ${cert.instructorName} on Tokslearn.`
  return {
    title: `Certificate ${cert.code}`,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: `/verify/${cert.code}` },
    openGraph: {
      type: 'website',
      title: `${cert.recipientName}, ${cert.courseTitle}`,
      description,
    },
  }
}

export default function VerifyCodePage({ params }: { params: Params }) {
  return (
    <>
      <Suspense fallback={<Skeleton />}>
        <Result params={params} />
      </Suspense>
      {/* Also the page's dynamic marker: metadata reads the code at request time (Next docs,
          generateMetadata with Cache Components), so the shell must know the page is dynamic. */}
      <Suspense fallback={null}>
        <CountView params={params} />
      </Suspense>
    </>
  )
}

function Skeleton() {
  return (
    <>
      <PageHeader title="Certificate check" />
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        <div className="h-80 max-w-[880px] rounded-dialog border border-border bg-surface" />
      </div>
    </>
  )
}

async function Result({ params }: { params: Params }) {
  const raw = decodeURIComponent((await params).code).slice(0, 40)
  const code = normaliseCertificateCode(raw)
  // One address per certificate: lower case, spaces or O-for-0 typos land on the real one.
  if (code && code !== raw) permanentRedirect(`/verify/${code}` as Route)
  const cert = code ? await getPublicCertificate(code) : null
  if (!code || !cert) return <NotFound code={raw} />
  return <CertificateView cert={cert} />
}

/** `certificate_verified`, recorded after the response so the page never waits for it. */
async function CountView({ params }: { params: Params }) {
  await connection()
  const code = await codeFrom(params)
  if (code) after(() => recordCertificateView(code))
  return null
}

function NotFound({ code }: { code: string }) {
  return (
    <>
      <PageHeader title="Certificate check" />
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        <EmptyState
          className="max-w-[640px]"
          headingLevel={2}
          title={`No certificate found with the code ${code}`}
          description="Check the code for typing mistakes. Certificate codes look like TL-C-8Q2M-4K7P."
          action={
            <Link href="/verify" className={buttonClasses({ variant: 'secondary' })}>
              Try another code
            </Link>
          }
        />
      </div>
    </>
  )
}

function CertificateView({ cert }: { cert: PublicCertificateDto }) {
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/verify/${cert.code}`
  const revoked = cert.status === 'revoked'
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Awarded to', value: cert.recipientName },
    {
      label: 'Course',
      value: cert.courseSlug ? (
        <Link
          href={`/courses/${cert.courseSlug}` as Route}
          className="text-brand-ink underline-offset-2 hover:underline"
        >
          {cert.courseTitle}
        </Link>
      ) : (
        cert.courseTitle
      ),
    },
    {
      label: 'Instructor',
      value: cert.instructorSlug ? (
        <Link
          href={`/instructors/${cert.instructorSlug}` as Route}
          className="text-brand-ink underline-offset-2 hover:underline"
        >
          {cert.instructorName}
        </Link>
      ) : (
        cert.instructorName
      ),
    },
    { label: 'How it was earned', value: cert.basisText },
    { label: 'Issued', value: formatDate(cert.issuedAt) },
    { label: 'Code', value: <span className="font-mono tracking-wide">{cert.code}</span> },
  ]
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/verify" className="hover:text-ink">
            Verify a certificate
          </Link>
        }
        title={revoked ? 'This certificate was revoked' : 'This certificate is genuine'}
        description={
          revoked
            ? `Tokslearn issued it to ${cert.recipientName}, then withdrew it. It no longer counts.`
            : `Tokslearn issued it to ${cert.recipientName} for ${cert.courseTitle}.`
        }
      />
      <div className="mx-auto max-w-page px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <div className="grid max-w-[880px] gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
          <div className="rounded-dialog border border-border bg-surface">
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
              <h2 className="text-h4 text-ink">Certificate details</h2>
              {revoked ? <Badge tone="danger">Revoked</Badge> : <Badge tone="brand">Valid</Badge>}
            </div>
            {revoked ? (
              <div className="border-b border-border bg-danger-soft px-6 py-4 text-body-sm text-ink">
                <p className="font-semibold">
                  Revoked{cert.revokedAt ? ` on ${formatDate(cert.revokedAt)}` : ''}
                </p>
                {cert.revokedReason ? <p className="mt-1">{cert.revokedReason}</p> : null}
              </div>
            ) : null}
            <dl className="divide-y divide-border px-6">
              {rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-4 py-3.5">
                  <dt className="text-body-sm text-ink-2">{row.label}</dt>
                  <dd className="text-body-sm font-semibold text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-center md:text-center">
            <QrCode value={url} size={144} label={`QR code for this page, ${cert.code}`} />
            <p className="text-body-sm text-ink-2">
              The same QR code is printed on the certificate. It opens this page.
            </p>
          </div>
        </div>
      </div>
      {revoked ? null : (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'EducationalOccupationalCredential',
            name: `Certificate: ${cert.courseTitle}`,
            credentialCategory: 'certificate',
            identifier: cert.code,
            url,
            dateCreated: cert.issuedAt,
            description: `${cert.basisText}.`,
            recognizedBy: {
              '@type': 'Organization',
              name: 'Tokslearn',
              url: env.NEXT_PUBLIC_APP_URL,
            },
            ...(cert.courseSlug
              ? {
                  about: {
                    '@type': 'Course',
                    name: cert.courseTitle,
                    url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/courses/${cert.courseSlug}`,
                  },
                }
              : {}),
          }}
        />
      )}
    </>
  )
}
