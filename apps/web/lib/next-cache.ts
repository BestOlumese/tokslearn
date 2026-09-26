import 'server-only'
import type { CacheAdapter } from '@tokslearn/core/kernel'
import { revalidateTag } from 'next/cache'

/** Core's cache adapter backed by Next.js tags (docs/03 §5). */
export const nextCache: CacheAdapter = {
  async invalidate(tags) {
    for (const tag of tags) revalidateTag(tag, 'max')
  },
}
