/**
 * Keeps core framework-agnostic (docs/03 §5). The web app injects a Next.js implementation
 * (`revalidateTag`/`updateTag`); jobs inject a no-op or an HTTP revalidate call.
 */
export interface CacheAdapter {
  invalidate(tags: ReadonlyArray<string>): Promise<void>
}

export const noopCache: CacheAdapter = { invalidate: async () => {} }

/** Cache tag names in one place so writers and readers agree. */
export const cacheTags = {
  featureFlags: 'feature-flags',
  settings: 'settings',
} as const
