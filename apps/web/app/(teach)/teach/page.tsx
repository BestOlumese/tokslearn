import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Teach on Tokslearn', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Teach on Tokslearn"
      message="Instructor applications open soon. You'll apply with your expertise and a sample of your teaching, then verify your identity with your BVN or NIN."
    />
  )
}
