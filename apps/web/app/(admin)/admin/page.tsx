import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminPageHeader } from '@/components/admin/admin-page-header'

export const metadata: Metadata = { title: 'Admin' }

// docs/20 §6 `/admin` dashboard arrives in Phase 10.
export default function AdminHomePage() {
  return (
    <div>
      <AdminPageHeader title="Back office" />
      <EmptyState
        className="max-w-[640px]"
        title="Dashboard not built yet"
        description="Orders, revenue and alerts arrive in Phase 10. Users, the audit log and feature flags work now."
        action={
          <Link href="/admin/users" className={buttonClasses({ variant: 'secondary' })}>
            Open users
          </Link>
        }
      />
    </div>
  )
}
