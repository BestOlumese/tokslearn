import type { MyApplicationDto } from '@tokslearn/contract'
import { buttonClasses } from '@tokslearn/ui/button'
import Link from 'next/link'
import { SettingsPanel } from '@/components/account/settings-panel'
import { formatDate } from '@/lib/format'

/** Submitted, in review, or rejected and waiting to reapply (docs/20 /teach/apply states). */
export function ApplicationStatus({ state }: { state: MyApplicationDto }) {
  const app = state.application
  if (!app) return null

  if (app.status === 'rejected') {
    return (
      <SettingsPanel
        id="status"
        title="Your application wasn't approved"
        description={
          state.canReapplyAt
            ? `You can apply again on ${formatDate(state.canReapplyAt)}.`
            : 'You can apply again now.'
        }
        footer={
          <Link href="/teach" className={buttonClasses({ variant: 'secondary' })}>
            Read what we look for
          </Link>
        }
      >
        <p className="text-body-sm text-ink-2">The reviewer's reason</p>
        <p className="mt-1 whitespace-pre-line text-body text-ink">{app.decisionReason}</p>
      </SettingsPanel>
    )
  }

  return (
    <SettingsPanel
      id="status"
      title="Your application is in review"
      description={
        app.submittedAt
          ? `Submitted on ${formatDate(app.submittedAt)}. A reviewer usually decides within 3 working days, and we'll email you either way.`
          : 'A reviewer usually decides within 3 working days.'
      }
      footer={
        <Link href="/courses" className={buttonClasses({ variant: 'secondary' })}>
          Browse courses while you wait
        </Link>
      }
    >
      <ol className="flex flex-col gap-3 text-body text-ink">
        <li>1. A reviewer reads your answers and opens your sample.</li>
        <li>2. They check your identity result and bank name match.</li>
        <li>3. If approved, you can build your first course straight away.</li>
      </ol>
    </SettingsPanel>
  )
}
