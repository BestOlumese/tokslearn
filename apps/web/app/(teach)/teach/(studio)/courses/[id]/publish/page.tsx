import type { Metadata } from 'next'
import { PublishPanel } from '@/components/studio/publish-panel'

export const metadata: Metadata = { title: 'Publish' }

// docs/20 §5 `/teach/courses/[id]/publish`.
export default function PublishPage() {
  return <PublishPanel />
}
