import type { Metadata } from 'next'
import { ContentPage } from '@/components/site/content-page'

export const metadata: Metadata = {
  title: 'About Tokslearn',
  description:
    'Tokslearn is an online course marketplace built for Nigeria: naira prices, Paystack payments and certificates anyone can verify.',
}

export default function AboutPage() {
  return (
    <ContentPage
      title="About Tokslearn"
      description="An online course marketplace built for learners and instructors in Nigeria."
    >
      <p>
        Good teachers in Nigeria have been selling courses through WhatsApp groups, Google Drive
        links and foreign platforms that charge in dollars. Tokslearn gives them one place to sell
        in naira, and gives learners one place to buy with confidence.
      </p>
      <h2>What we do differently</h2>
      <ul>
        <li>
          <strong>Prices in naira.</strong> Pay by card, bank transfer or USSD through Paystack.
        </li>
        <li>
          <strong>Refund rules up front.</strong> Every course states its refund window before you
          pay.
        </li>
        <li>
          <strong>Checked instructors.</strong> Instructors verify their identity and each course is
          reviewed before it goes live.
        </li>
        <li>
          <strong>Certificates you can prove.</strong> Each one has a code anyone can check at
          tokslearn.com/verify.
        </li>
        <li>
          <strong>Built for mobile data.</strong> Pages are light and video adjusts to your
          connection.
        </li>
      </ul>
      <h2>Contact</h2>
      <p>
        Email <a href="mailto:support@tokslearn.com">support@tokslearn.com</a>. A person reads every
        message.
      </p>
    </ContentPage>
  )
}
