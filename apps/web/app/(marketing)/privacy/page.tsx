import type { Metadata } from 'next'
import { ConsentSettingsButton } from '@/components/consent-settings-button'
import { ContentPage } from '@/components/site/content-page'

export const metadata: Metadata = { title: 'Privacy', robots: { index: false } }

// Summary from docs/14 §3 and docs/compliance/ropa.md; the full policy is reviewed before launch.
export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy"
      description="What we collect, why, and who helps us run Tokslearn."
      updated="Plain-language summary under the Nigeria Data Protection Act. The full policy is being reviewed and will replace this page before launch."
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> name, email and a securely hashed password.
        </li>
        <li>
          <strong>Your learning:</strong> courses you buy, your progress, quiz and exam results.
        </li>
        <li>
          <strong>Payments:</strong> order details and the Paystack reference. We never see or store
          card numbers.
        </li>
        <li>
          <strong>Instructors only:</strong> the result of the BVN or NIN check. We never store the
          number itself.
        </li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>We don't sell your data or show you ads.</li>
        <li>Instructors see your name and progress in their courses, not your email.</li>
        <li>Usage analytics only run if you say yes when you first visit.</li>
      </ul>
      <h2 id="analytics">Analytics</h2>
      <p>
        We only count page visits if you said yes when you first came. You can change your answer at
        any time.
      </p>
      <p>
        <ConsentSettingsButton className="inline-flex min-h-11 items-center font-medium text-brand-ink underline underline-offset-4" />
      </p>
      <h2>Who helps us</h2>
      <p>
        Paystack (payments), Neon (database, Frankfurt), Vercel (hosting), Bunny (video), Resend
        (email), Sentry (error reports) and PostHog (analytics, EU). Some of these store data
        outside Nigeria; each is bound by a data processing agreement.
      </p>
      <h2>Your rights</h2>
      <p>
        You can download your data or delete your account from{' '}
        <a href="/account/settings/privacy">Privacy and data</a> in your settings. For anything
        else, email <a href="mailto:support@tokslearn.com">support@tokslearn.com</a>.
      </p>
    </ContentPage>
  )
}
