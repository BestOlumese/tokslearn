import 'server-only'
import type { CacheAdapter } from '@tokslearn/core/kernel'
import { revalidateTag } from 'next/cache'

/**
 * Core's cache adapter backed by Next.js tags (docs/03 §5). One course or instructor must never
 * show old content after a change (a stale price is a wrong price), so those tags expire at once;
 * broad tags like `catalog` refresh in the background ('max').
 */
const exact = /^(course|course-slug|instructor):/

export const nextCache: CacheAdapter = {
  async invalidate(tags) {
    for (const tag of tags) revalidateTag(tag, exact.test(tag) ? { expire: 0 } : 'max')
  },
}
