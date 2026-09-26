import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/** Full site frame: product header, page content, footer. Auth pages use their own frame. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
