import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'About Tokslearn', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="About Tokslearn"
      message="This page will introduce the team behind Tokslearn and how we choose instructors."
    />
  )
}
