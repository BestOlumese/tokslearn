import type { SideNavItem } from '@/components/side-nav-links'

// Nav item lists live outside 'use client' files so server layouts can render them too.

export const settingsNavItems: ReadonlyArray<SideNavItem> = [
  { href: '/account/settings/profile', label: 'Profile' },
  { href: '/account/settings/security', label: 'Sign-in and security' },
  { href: '/account/settings/notifications', label: 'Notifications' },
  { href: '/account/settings/privacy', label: 'Privacy and data' },
]

export const adminNavItems: ReadonlyArray<SideNavItem> = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/settings/flags', label: 'Feature flags' },
]
