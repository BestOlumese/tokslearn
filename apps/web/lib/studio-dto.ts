import 'server-only'
import { listMyCourses } from '@tokslearn/core/courses'
import type { Ctx } from '@tokslearn/core/kernel'
import type { BundleCourseOption } from '@/components/studio/bundle-form'

/** Course choices for the bundle form, as plain strings for the client component. */
export async function bundleCourseOptions(ctx: Ctx): Promise<BundleCourseOption[]> {
  return (await listMyCourses(ctx)).map((c) => ({
    id: c.id,
    title: c.title,
    isPublished: c.hasLive,
    priceKobo: c.priceKobo.toString(),
  }))
}
