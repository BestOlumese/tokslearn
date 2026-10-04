import {
  Activity,
  Award,
  Banknote,
  Bell,
  BookOpen,
  BookText,
  ClipboardCheck,
  FileCheck2,
  Flag,
  FolderTree,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  MessageCircleQuestion,
  Percent,
  Receipt,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  TicketPercent,
  Undo2,
  UserRound,
  Users,
  Video,
  Wallet,
} from 'lucide-react'
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
    items: [
      { href: '/admin', label: 'Dashboard', icon: icon(LayoutDashboard) },
      { href: '/admin/users', label: 'Users', icon: icon(Users) },
    ],
  },
  {
    label: 'Instructors',
    items: [
      { href: '/admin/instructors', label: 'Instructors', icon: icon(GraduationCap) },
      {
        href: '/admin/instructors/applications',
        label: 'Applications',
        icon: icon(ClipboardCheck),
      },
      { href: '/admin/reviews/courses', label: 'Course reviews', icon: icon(FileCheck2) },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/admin/courses', label: 'Courses', icon: icon(BookOpen) },
      { href: '/admin/categories', label: 'Categories', icon: icon(FolderTree) },
      { href: '/admin/certificates', label: 'Certificates', icon: icon(Award) },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: icon(Receipt) },
      { href: '/admin/refunds', label: 'Refunds', icon: icon(Undo2) },
      { href: '/admin/payouts', label: 'Payouts', icon: icon(Banknote) },
      { href: '/admin/ledger', label: 'Ledger', icon: icon(BookText) },
      { href: '/admin/coupons', label: 'Coupons', icon: icon(TicketPercent) },
      { href: '/admin/settings/commission', label: 'Commission', icon: icon(Percent) },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/admin/moderation', label: 'Moderation', icon: icon(ShieldAlert) },
      { href: '/admin/audit', label: 'Audit log', icon: icon(ScrollText) },
      { href: '/admin/jobs', label: 'Background jobs', icon: icon(Activity) },
      {
        href: '/admin/settings/platform',
        label: 'Platform settings',
        icon: icon(SlidersHorizontal),
      },
      { href: '/admin/settings/flags', label: 'Feature flags', icon: icon(Flag) },
    ],
  },
]

/** Instructor studio (docs/20 §5). More items arrive with their phases. */
export const studioNavGroups: ReadonlyArray<SideNavGroup> = [
  {
    label: 'Studio',
    items: [
      { href: '/teach/courses', label: 'Courses', icon: icon(BookOpen) },
      { href: '/teach/bundles', label: 'Bundles', icon: icon(Layers) },
      { href: '/teach/grading', label: 'Grading', icon: icon(ClipboardCheck) },
      { href: '/teach/qa', label: 'Q&A', icon: icon(MessageCircleQuestion) },
      { href: '/teach/reviews', label: 'Reviews', icon: icon(Star) },
      { href: '/teach/live', label: 'Live', icon: icon(Video) },
    ],
  },
  {
    label: 'Selling',
    items: [
      { href: '/teach/coupons', label: 'Coupons', icon: icon(TicketPercent) },
      { href: '/teach/referrals', label: 'Referral links', icon: icon(Link2) },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/teach/earnings', label: 'Earnings', icon: icon(Wallet) },
      { href: '/teach/settings', label: 'Settings', icon: icon(Settings) },
    ],
  },
]
