import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// Public R2 files: cdn.tokslearn.com later, the bucket's r2.dev URL until the domain exists.
const cdnOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_CDN_URL ?? '').origin
  } catch {
    return 'https://cdn.tokslearn.com'
  }
})()

/**
 * Report-only CSP for Phase 0 (docs/14 §2). Switch to an enforced, nonce-based policy once the
 * third-party list is final; allowed origins match the providers in docs/04.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.paystack.co https://eu-assets.i.posthog.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${cdnOrigin} https://*.b-cdn.net`,
  "font-src 'self'",
  // Uploads PUT straight to R2 through presigned URLs (docs/14 §5).
  "connect-src 'self' https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://api.paystack.co https://*.r2.cloudflarestorage.com https://video.bunnycdn.com",
  'frame-src https://checkout.paystack.com https://iframe.mediadelivery.net https://*.daily.co',
  "media-src 'self' blob: https://*.b-cdn.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy-Report-Only', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera and microphone are opened per route for live classes and KYC (Phases 2 and 8).
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
  },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Metadata always in <head>, never streamed into <body>: link previews (WhatsApp, Telegram,
  // LinkedIn) and audits read only the head, and our generateMetadata reads cached data (ADR-032).
  htmlLimitedBots: /.*/,
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  transpilePackages: [
    '@tokslearn/api',
    '@tokslearn/contract',
    '@tokslearn/core',
    '@tokslearn/db',
    '@tokslearn/integrations',
    '@tokslearn/jobs',
    '@tokslearn/ui',
  ],
  serverExternalPackages: ['pg'],
  // Covers and avatars are stored as uploaded (often 2–3 MB PNGs). Pages ask /_next/image for a
  // resized WebP through a plain <img srcset> (lib/image.ts), so there is no next/image JS.
  // File keys change on every upload, so resized copies can be cached for a month (ADR-032).
  images: {
    remotePatterns: [new URL(`${cdnOrigin}/**`)],
    formats: ['image/webp'],
    deviceSizes: [640, 828, 1200],
    imageSizes: [64, 128, 256, 384],
    qualities: [70],
    minimumCacheTTL: 2_678_400,
    maximumRedirects: 0,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The instructor application takes a selfie for the identity check (docs/07 §5). Later
      // entries override earlier ones for the same header key.
      {
        source: '/teach/apply',
        headers: [
          {
            key: 'Permissions-Policy',
            value:
              'camera=(self), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
          },
        ],
      },
    ]
  },
}

// Source maps upload only when CI provides a Sentry token; otherwise the config is untouched.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
      ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: false,
    })
  : nextConfig
