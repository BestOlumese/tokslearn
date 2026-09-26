import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Terms of use', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Terms of use"
      message="Our terms are with a lawyer for review and will be published here before anyone can buy a course."
    />
  )
}
