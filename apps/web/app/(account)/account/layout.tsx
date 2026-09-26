import type { ReactNode } from 'react'
import { QueryProvider } from '@/components/query-provider'
import { SiteChrome } from '@/components/site/site-chrome'

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <SiteChrome>
      <QueryProvider>{children}</QueryProvider>
    </SiteChrome>
  )
}
