import { shareCard, shareSize } from '@/components/seo/share-card'
import { getCourse } from '@/lib/catalog-data'
import { formatDuration, formatNaira } from '@/lib/format'

// The bundled Satori font has no ₦ glyph, so share images spell out NGN.
export const alt = 'Course on Tokslearn'
export const size = shareSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await getCourse(slug)
  if (result.kind !== 'course') {
    return shareCard({ eyebrow: 'Online course', title: 'Courses on Tokslearn', lines: [] })
  }
  const c = result.course
  return shareCard({
    eyebrow: c.topCategory?.name ?? 'Online course',
    title: c.title,
    lines: [
      `By ${c.instructor.name}`,
      `${c.priceKobo === '0' ? 'Free' : formatNaira(c.priceKobo).replace('₦', 'NGN ')} · ${c.lessonCount} lessons · ${formatDuration(c.totalDurationSec)}`,
    ],
  })
}
