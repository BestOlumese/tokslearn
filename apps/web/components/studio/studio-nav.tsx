'use client'
// Client component: highlights the current studio section.

import { usePathname } from 'next/navigation'
import { SideNavLinks } from '@/components/side-nav-links'
import { studioNavGroups } from '@/lib/nav'

export function StudioNav({ hide = [] }: { hide?: ReadonlyArray<string> }) {
  const groups = studioNavGroups.map((g) => ({
    ...g,
    items: g.items.filter((i) => !hide.includes(i.href)),
  }))
  return <SideNavLinks label="Studio" groups={groups} activeHref={usePathname()} match="prefix" />
}
