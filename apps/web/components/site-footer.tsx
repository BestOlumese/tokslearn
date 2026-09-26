import Link from 'next/link'
import { footerNav, supportEmail } from '@/lib/site'
import { ConsentSettingsButton } from './consent-settings-button'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {footerNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center text-body-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <ConsentSettingsButton />
            </li>
          </ul>
        </nav>
        <p className="text-body-sm text-ink-3">
          Questions about a course, a payment or a certificate? Email{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="text-brand underline underline-offset-4 hover:text-brand-hover"
          >
            {supportEmail}
          </a>
          . Prices are in naira and payments go through Paystack.
        </p>
      </div>
    </footer>
  )
}
