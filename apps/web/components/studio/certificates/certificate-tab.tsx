'use client'
// Client component: the course's Certificate tab (docs/20 `/teach/courses/[id]/certificate`).

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@tokslearn/ui/skeleton'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'
import { useCourseEditor } from '../course-editor-provider'
import { CertificateRules } from './certificate-rules'
import { ExternalResults } from './external-results'
import { IssuedCertificates } from './issued-certificates'

export function CertificateTab() {
  const { course } = useCourseEditor()
  const client = useQueryClient()
  const options = orpc.studio.certificates.get.queryOptions({ input: { courseId: course.id } })
  const q = useQuery(options)
  if (q.isPending) return <Skeleton className="h-96 w-full max-w-[860px] rounded-card" />
  if (!q.data) return <FormAlert tone="error">{apiErrorMessage(q.error)}</FormAlert>
  const s = q.data
  // Results can be recorded once external mode is saved (live or waiting for review).
  const external = s.mode === 'external' || s.liveMode === 'external'
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <CertificateRules
        initial={s}
        onSaved={(next) => client.setQueryData(options.queryKey, next)}
      />
      {external ? (
        <ExternalResults courseId={course.id} defaultProvider={s.settings.providerName ?? ''} />
      ) : null}
      {s.liveMode !== 'none' || s.issuedCount > 0 ? (
        <IssuedCertificates courseId={course.id} canEdit={s.canEdit} />
      ) : null}
    </div>
  )
}
