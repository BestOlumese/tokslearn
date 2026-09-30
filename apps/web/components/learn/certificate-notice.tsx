'use client'
// Client component: tells the learner in the player that their certificate is ready (docs/10 §8).
// Issuing runs in a job a few seconds after the pass or the last lesson, so while the criteria
// are met but nothing is issued yet it says so and checks back until it appears.

import { buttonClasses } from '@tokslearn/ui/button'
import { Award } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { type CourseCertificateDto, myCourseCertificate } from '@/lib/learn-api'

const POLL_MS = 3000
const MAX_TRIES = 20

export function CertificateNotice({
  courseId,
  initial,
}: {
  courseId: string
  initial: CourseCertificateDto
}) {
  const [state, setState] = useState(initial)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!state.preparing || state.certificate) return
    let tries = 0
    let stopped = false
    const timer = setInterval(async () => {
      tries++
      try {
        const next = await myCourseCertificate(courseId)
        if (!stopped && (next.certificate || !next.preparing)) {
          setState(next)
          clearInterval(timer)
        }
      } catch {
        // Offline for a moment: the next tick tries again.
      }
      if (tries >= MAX_TRIES) {
        clearInterval(timer)
        if (!stopped) setSlow(true)
      }
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [courseId, state.preparing, state.certificate])

  const cert = state.certificate
  if (cert?.status === 'active') {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-brand/30 bg-brand-soft p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Award aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-ink" />
          <div>
            <p className="text-body font-semibold text-ink">Your certificate is ready</p>
            <p className="text-body-sm text-ink-2">
              Code <span className="font-mono tracking-wide text-ink">{cert.code}</span>
            </p>
          </div>
        </div>
        <Link
          href="/account/certificates"
          className={buttonClasses({ size: 'sm', className: 'w-fit shrink-0' })}
        >
          View certificate
        </Link>
      </div>
    )
  }
  if (!cert && state.preparing) {
    return (
      <p
        role="status"
        className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 text-body-sm text-ink-2"
      >
        <Award aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-3" />
        {slow
          ? 'Your certificate is taking longer than usual. We’ll email you the moment it’s ready.'
          : 'You’ve earned the certificate. We’re preparing it now; it appears here in a moment.'}
      </p>
    )
  }
  return null
}
