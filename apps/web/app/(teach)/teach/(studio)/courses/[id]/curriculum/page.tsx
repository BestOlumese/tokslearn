import type { Metadata } from 'next'
import { CurriculumEditor } from '@/components/studio/curriculum-editor'

export const metadata: Metadata = { title: 'Curriculum' }

// docs/20 §5 `/teach/courses/[id]/curriculum`. Quiz, assignment and live lessons arrive in Phases 6 and 8.
export default function CurriculumPage() {
  return <CurriculumEditor />
}
