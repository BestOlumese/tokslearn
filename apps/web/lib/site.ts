import type { Route } from 'next'

// Global chrome links (docs/20 §0). Search, cart, bell and the avatar menu join in Phases 1–4.

export const primaryNav: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/courses', label: 'Courses' },
  { href: '/teach', label: 'Teach on Tokslearn' },
]

export const footerNav: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/about', label: 'About' },
  { href: '/teach', label: 'Teach' },
  { href: '/verify', label: 'Verify a certificate' },
  { href: '/help', label: 'Help' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refund-policy', label: 'Refund policy' },
]

export const supportEmail = 'support@tokslearn.com'
