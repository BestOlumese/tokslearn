'use client'
// Client component: end an override or promo now (reason goes to the audit log).

import { useRouter } from 'next/navigation'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { ReasonDialog } from './reason-dialog'

export function CommissionEndRule({ ruleId, label }: { ruleId: string; label: string }) {
  const router = useRouter()
  return (
    <ReasonDialog
      trigger="End"
      triggerLabel={`End ${label}`}
      title="End this rate?"
      description="New orders go back to the instructor's override or the default. Orders already placed keep their rate."
      confirmLabel="End rate"
      onConfirm={async (note) => {
        try {
          await api.admin.commission.endRule({ ruleId, note })
          router.refresh()
          return null
        } catch (e) {
          return apiErrorMessage(e)
        }
      }}
    />
  )
}
