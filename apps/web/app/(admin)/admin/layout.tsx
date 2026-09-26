import type { Metadata } from 'next'
import { type ReactNode, Suspense } from 'react'
import { AdminNav } from '@/components/admin/admin-nav'
import { QueryProvider } from '@/components/query-provider'
import { SideNavLinks } from '@/components/side-nav-links'
import { adminNavItems } from '@/lib/nav'

export const metadata: Metadata = { robots: { index: false, follow: false } }

// Back office shell: left nav on desktop, scrollable tabs on phones (docs/11 §5 Dashboards).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="mx-auto max-w-page px-4 pt-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-[200px_1fr] lg:gap-10">
          <Suspense
            fallback={<SideNavLinks label="Admin" items={adminNavItems} activeHref={null} />}
          >
            <AdminNav />
          </Suspense>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </QueryProvider>
  )
}
