import type { Metadata } from 'next'
import { type ReactNode, Suspense } from 'react'
import { AdminNav } from '@/components/admin/admin-nav'
import { QueryProvider } from '@/components/query-provider'
import { SideNavLinks } from '@/components/side-nav-links'
import { SiteChrome } from '@/components/site/site-chrome'
import { adminNavGroups } from '@/lib/nav'

export const metadata: Metadata = { robots: { index: false, follow: false } }

// Back office shell: grouped side menu, content on the right (docs/11 §5 Dashboards).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SiteChrome>
      <QueryProvider>
        <div className="mx-auto grid max-w-catalog gap-6 px-4 pt-6 sm:px-6 md:grid-cols-[210px_minmax(0,1fr)] md:gap-10 md:pt-10 lg:px-8">
          <div>
            <p className="mb-4 hidden px-3 text-body-sm font-semibold text-ink md:block">
              Back office
            </p>
            <Suspense
              fallback={<SideNavLinks label="Admin" groups={adminNavGroups} activeHref={null} />}
            >
              <AdminNav />
            </Suspense>
          </div>
          <div className="min-w-0">{children}</div>
        </div>
      </QueryProvider>
    </SiteChrome>
  )
}
