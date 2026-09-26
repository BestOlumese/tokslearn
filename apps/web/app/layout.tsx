import type { Metadata, Viewport } from 'next'
import { Figtree } from 'next/font/google'
import { type ReactNode, Suspense } from 'react'
import { ConsentBanner } from '@/components/consent-banner'
import { LazyToaster } from '@/components/lazy-toaster'
import { PageviewTracker } from '@/components/pageview-tracker'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SkipLink } from '@/components/skip-link'
import { env } from '@/env'
import { consentBootScript } from '@/lib/consent'
import './globals.css'

const figtree = Figtree({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-figtree',
  weight: 'variable',
})

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: 'Tokslearn — courses from working instructors, paid in naira',
    template: '%s | Tokslearn',
  },
  description:
    'Tokslearn is a course marketplace for Nigeria. Every course is reviewed before it goes live, shows its refund rules before you pay, and can end in a certificate anyone can verify.',
  applicationName: 'Tokslearn',
  openGraph: { siteName: 'Tokslearn', locale: 'en_NG', type: 'website' },
  twitter: { card: 'summary_large_image' },
  // Placeholder environments must never be indexed.
  robots: env.NEXT_PUBLIC_APP_ENV === 'production' ? undefined : { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#F6F7F6',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the consent boot script sets data-consent on <html> before React loads.
    <html lang="en-NG" className={figtree.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static first-party script, no user input. */}
        <script dangerouslySetInnerHTML={{ __html: consentBootScript }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-canvas text-ink">
        <SkipLink />
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <ConsentBanner />
        <Suspense fallback={null}>
          <PageviewTracker />
        </Suspense>
        <LazyToaster />
      </body>
    </html>
  )
}
