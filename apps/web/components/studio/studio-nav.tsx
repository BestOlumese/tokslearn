'use client'
// Client component: highlights the current studio section.

import { usePathname } from 'next/navigation'
import { SideNavLinks } from '@/components/side-nav-links'
import { studioNavGroups } from '@/lib/nav'

export function StudioNav() {
  return (
    <SideNavLinks
      label="Studio"
      groups={studioNavGroups}
      activeHref={usePathname()}
      match="prefix"
    />
  )
}
