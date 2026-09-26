import type { Metadata } from 'next'
import { ContentPage } from '@/components/site/content-page'

export const metadata: Metadata = {
  title: 'Refund policy',
  description:
    'How refunds work on Tokslearn: each course sets a window of 0, 3, 7 or 14 days, shown before you pay.',
}

// Summary of ADR-004 and ADR-018. The legal version is reviewed before launch (Phase 11).
export default function RefundPolicyPage() {
  return (
    <ContentPage
      title="Refund policy"
      description="Each course sets its own refund window. You'll always see it before you pay."
      updated="Plain-language summary. The full policy is being reviewed and will replace this page before launch."
    >
      <h2>How long you have</h2>
      <p>
        Instructors choose a refund window of none, 3, 7 or 14 days for each course. The window
        starts when you pay and is shown on the course page, at checkout and on your receipt.
      </p>
      <h2>When a refund isn't possible</h2>
      <p>Within the window, you can get a refund unless you have already:</p>
      <ul>
        <li>watched more than 30% of the course,</li>
        <li>downloaded a resource the instructor marked as important,</li>
        <li>received the course certificate, or</li>
        <li>started the course's final exam.</li>
      </ul>
      <p>We tell you before any of these happens, so you're never surprised.</p>
      <h2>How to ask for one</h2>
      <p>
        Open the order in your account and press "Request refund". You'll see straight away whether
        the course qualifies and why. Approved refunds go back to the card or account you paid with
        through Paystack.
      </p>
      <h2>If you disagree</h2>
      <p>
        You can appeal a decision once, from the same page. A member of our team reviews it. You can
        also email <a href="mailto:support@tokslearn.com">support@tokslearn.com</a>.
      </p>
    </ContentPage>
  )
}
