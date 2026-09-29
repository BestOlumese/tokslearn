import type { Metadata } from 'next'
import { DripEditor } from '@/components/studio/drip-editor'

export const metadata: Metadata = { title: 'Drip schedule' }

// docs/20 §5 `/teach/courses/[id]/drip`.
export default function DripPage() {
  return <DripEditor />
}
