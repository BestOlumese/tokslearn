import type { Metadata } from 'next'
import { StaffManager } from '@/components/studio/staff-manager'

export const metadata: Metadata = { title: 'Teaching assistants' }

// docs/20 §5 `/teach/courses/[id]/staff`.
export default function StaffPage() {
  return <StaffManager />
}
