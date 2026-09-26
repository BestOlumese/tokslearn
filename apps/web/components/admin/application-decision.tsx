'use client'
// Client component: approve or reject an instructor application (admin.instructors.decide).

import { useRouter } from 'next/navigation'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { ReasonDialog } from './reason-dialog'

export function ApplicationDecision({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const decide = (decision: 'approve' | 'reject') => async (reason: string) => {
    try {
      await api.admin.instructors.decide({ id, decision, reason })
      router.refresh()
      return null
    } catch (e) {
      return apiErrorMessage(e)
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ReasonDialog
        trigger="Approve"
        triggerVariant="primary"
        title={`Approve ${name}?`}
        description="They get the instructor role and can start building courses. A bank account or identity check waiting for review is accepted too."
        confirmLabel="Approve"
        minLength={10}
        maxLength={1000}
        reasonHelper="What you checked. Saved in the audit log; the applicant doesn't see it."
        onConfirm={decide('approve')}
      />
      <ReasonDialog
        trigger="Reject"
        triggerVariant="danger"
        title={`Reject ${name}'s application?`}
        description="They can apply again in 30 days."
        confirmLabel="Reject"
        confirmVariant="danger"
        minLength={10}
        maxLength={1000}
        reasonHelper="The applicant sees this in their email. Say what to fix, plainly."
        onConfirm={decide('reject')}
      />
    </div>
  )
}
