import type { MetadataRoute } from 'next'
import { env } from '@/env'
import { sitemapRows } from '@/lib/catalog-data'

// docs/12 §5: one sitemap per type at /sitemap/{id}.xml, listed in robots.ts. Rows are cached
// under the `catalog` tag, so publishing or unpublishing a course refreshes them.

export const sitemapKinds = ['pages', 'courses', 'categories', 'instructors'] as const
const kinds = sitemapKinds
type Kind = (typeof kinds)[number]

export function generateSitemaps() {
  return kinds.map((id) => ({ id }))
}

// `/teach` doubles as the studio and robots.ts blocks it, so it is left out.
const staticPages = [
  '',
  '/courses',
  '/categories',
  '/verify',
  '/about',
  '/help',
  '/refund-policy',
  '/terms',
  '/privacy',
  '/content-policy',
] as const

export default async function sitemap(props: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  const id = (await props.id) as Kind
  const site = env.NEXT_PUBLIC_APP_URL
  if (id === 'pages') return staticPages.map((path) => ({ url: `${site}${path}` }))
  if (!kinds.includes(id)) return []
  const prefix = { courses: 'courses', categories: 'categories', instructors: 'instructors' }[id]
  const rows = await sitemapRows(id)
  return rows.map((r) => ({ url: `${site}/${prefix}/${r.slug}`, lastModified: r.lastModified }))
}
