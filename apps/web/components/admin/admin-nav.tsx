'use client'
// Client component: highlights the current admin section.

import { usePathname } from 'next/navigation'
import { SideNavLinks } from '@/components/side-nav-links'
import { adminNavItems } from '@/lib/nav'

export function AdminNav() {
  return (
    <SideNavLinks label="Admin" items={adminNavItems} activeHref={usePathname()} match="prefix" />
  )
}
