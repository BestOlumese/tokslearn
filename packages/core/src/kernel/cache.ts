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
  /** Category tree, course listings, home rows (docs/03 §5). */
  catalog: 'catalog',
  course: (id: string) => `course:${id}`,
  /** A slug lookup, including "no course here", so a newly published slug isn't a cached 404. */
  courseSlug: (slug: string) => `course-slug:${slug}`,
  instructor: (id: string) => `instructor:${id}`,
  /** A learner's enrollments ("My learning", Continue buttons). */
  userEnrollments: (userId: string) => `user-enrollments:${userId}`,
} as const
