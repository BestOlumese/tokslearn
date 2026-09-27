import type { MetadataRoute } from 'next'
import { env } from '@/env'
import { sitemapKinds } from './sitemap'

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
    sitemap: sitemapKinds.map((k) => `${env.NEXT_PUBLIC_APP_URL}/sitemap/${k}.xml`),
  }
}
