import type { ReactNode } from 'react'
import { SiteChrome } from '@/components/site/site-chrome'

export default function Layout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>
}
