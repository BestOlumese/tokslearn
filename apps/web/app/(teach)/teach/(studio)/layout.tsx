import type { Metadata } from 'next'
import { type ReactNode, Suspense } from 'react'
import { QueryProvider } from '@/components/query-provider'
import { SideNavLinks } from '@/components/side-nav-links'
import { StudioNav } from '@/components/studio/studio-nav'
import { studioNavGroups } from '@/lib/nav'

export const metadata: Metadata = { robots: { index: false } }

// Instructor studio shell (docs/20 §5): side nav + the page. Each page checks the instructor role.
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="mx-auto grid max-w-catalog gap-6 px-4 pt-6 pb-16 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10 md:pt-10 lg:px-8">
        <Suspense
          fallback={<SideNavLinks label="Studio" groups={studioNavGroups} activeHref={null} />}
        >
          <StudioNav />
        </Suspense>
        <div className="min-w-0">{children}</div>
      </div>
    </QueryProvider>
  )
}
