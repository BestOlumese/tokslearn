'use client'
// Client component: highlights the current settings page.

import { usePathname } from 'next/navigation'
import { SideNavLinks } from '@/components/side-nav-links'
import { settingsNavGroups } from '@/lib/nav'

export function SettingsNav() {
  return <SideNavLinks label="Settings" groups={settingsNavGroups} activeHref={usePathname()} />
}
