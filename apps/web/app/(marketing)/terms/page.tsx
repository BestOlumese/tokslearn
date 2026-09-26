import type { Metadata } from 'next'
import { ContentPage } from '@/components/site/content-page'

export const metadata: Metadata = { title: 'Terms of use', robots: { index: false } }

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms of use"
      updated="Our terms are with a lawyer for review. They'll be published here before anyone can buy a course."
    >
      <p>Until then, here is what they will cover, in plain words:</p>
      <ul>
        <li>What you get when you buy a course, and how long you keep access.</li>
        <li>
          Refunds, as described in our <a href="/refund-policy">refund policy</a>.
        </li>
        <li>What you may and may not do with course material.</li>
        <li>What instructors agree to when they sell on Tokslearn.</li>
        <li>How to contact us and how disputes are handled under Nigerian law.</li>
      </ul>
      <p>
        Questions now? Email <a href="mailto:support@tokslearn.com">support@tokslearn.com</a>.
      </p>
    </ContentPage>
  )
}
