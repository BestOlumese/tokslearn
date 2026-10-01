import type { Metadata } from 'next'
import { CurriculumEditor } from '@/components/studio/curriculum-editor'
import { liveOn } from '@/lib/catalog-data'

export const metadata: Metadata = { title: 'Curriculum' }

// docs/20 §5 `/teach/courses/[id]/curriculum`. Live class lessons appear with the
// `live_classes` flag (Phase 8).
export default async function CurriculumPage() {
  return <CurriculumEditor liveClasses={await liveOn()} />
}
