import type { MetadataRoute } from 'next'
import { env } from '@/env'

export default function robots(): MetadataRoute.Robots {
  if (env.NEXT_PUBLIC_APP_ENV !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/learn', '/teach', '/admin', '/account', '/api', '/styleguide'],
    },
    // `sitemap` is added with app/sitemap.ts in Phase 3 (docs/12 §5).
  }
}
