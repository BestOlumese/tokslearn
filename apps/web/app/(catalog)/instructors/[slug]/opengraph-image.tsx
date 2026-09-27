import { shareCard, shareSize } from '@/components/seo/share-card'
import { getInstructor } from '@/lib/catalog-data'

export const alt = 'Instructor on Tokslearn'
export const size = shareSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await getInstructor(slug)
  if (result.kind !== 'instructor') {
    return shareCard({ eyebrow: 'Instructor', title: 'Instructors on Tokslearn', lines: [] })
  }
  const i = result.instructor
  return shareCard({
    eyebrow: 'Instructor',
    title: i.name,
    lines: [
      ...(i.headline ? [i.headline.slice(0, 60)] : []),
      `${i.courseCount} ${i.courseCount === 1 ? 'course' : 'courses'} on Tokslearn`,
    ],
  })
}
