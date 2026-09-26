import { Bell, Flag, KeyRound, ScrollText, ShieldCheck, UserRound, Users } from 'lucide-react'
import type { SideNavGroup } from '@/components/side-nav-links'

// Nav lists live outside 'use client' files so server layouts can render them too.
// Signed-in areas only: Lucide is fine here (public pages keep icons inline).

const icon = (Icon: typeof Bell) => <Icon aria-hidden strokeWidth={1.75} />

export const settingsNavGroups: ReadonlyArray<SideNavGroup> = [
  {
    label: 'Account',
    items: [
      { href: '/account/settings/profile', label: 'Profile', icon: icon(UserRound) },
      { href: '/account/settings/notifications', label: 'Notifications', icon: icon(Bell) },
    ],
  },
  {
    label: 'Security and privacy',
    items: [
      { href: '/account/settings/security', label: 'Sign-in and security', icon: icon(KeyRound) },
      { href: '/account/settings/privacy', label: 'Privacy and data', icon: icon(ShieldCheck) },
    ],
  },
]

export const adminNavGroups: ReadonlyArray<SideNavGroup> = [
  {
    label: 'People',
    items: [{ href: '/admin/users', label: 'Users', icon: icon(Users) }],
  },
  {
    label: 'Platform',
    items: [
      { href: '/admin/audit', label: 'Audit log', icon: icon(ScrollText) },
      { href: '/admin/settings/flags', label: 'Feature flags', icon: icon(Flag) },
    ],
  },
]
