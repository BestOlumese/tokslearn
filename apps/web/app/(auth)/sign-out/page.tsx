import type { Metadata } from 'next'
import { SignOut } from '@/components/auth/sign-out'

export const metadata: Metadata = { title: 'Signing out', robots: { index: false } }

// Target of "Sign out" in the header menu (a link, so the menu needs no JavaScript).
export default function SignOutPage() {
  return <SignOut />
}
