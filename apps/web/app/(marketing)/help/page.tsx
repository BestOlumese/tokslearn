import type { Metadata } from 'next'
import { PageHeader } from '@/components/site/page-header'

export const metadata: Metadata = {
  title: 'Help',
  description:
    'Answers about buying courses, refunds, certificates, your account and teaching on Tokslearn.',
}

const topics: ReadonlyArray<{ title: string; items: ReadonlyArray<[string, string]> }> = [
  {
    title: 'Buying courses',
    items: [
      [
        'How do I pay?',
        'By card, bank transfer or USSD through Paystack. Prices are in naira, so there are no dollar charges.',
      ],
      [
        'Do I need to confirm my email first?',
        'Yes, before your first purchase. We send the link when you sign up, and you can ask for a new one from your account.',
      ],
      [
        'How long do I keep a course?',
        'The course page says how long you have access. Most courses are yours for as long as they are on Tokslearn.',
      ],
    ],
  },
  {
    title: 'Refunds',
    items: [
      [
        'Can I get my money back?',
        'Each course sets a refund window of none, 3, 7 or 14 days. It ends early if you watch more than 30%, download an important resource, get the certificate or start the final exam.',
      ],
      [
        'How do I ask for a refund?',
        'Open the order in your account and press "Request refund". You see straight away whether it qualifies.',
      ],
    ],
  },
  {
    title: 'Certificates',
    items: [
      [
        'How do I earn a certificate?',
        'The course page explains it: usually by finishing the lessons, and for some courses by passing a final exam.',
      ],
      [
        'How can an employer check mine?',
        'They enter the code on your certificate at tokslearn.com/verify.',
      ],
    ],
  },
  {
    title: 'Your account',
    items: [
      [
        "I can't sign in",
        'Use "Email me a code instead" on the sign-in page, or reset your password. After 10 wrong passwords we pause sign-in for that email for 15 minutes.',
      ],
      [
        'How do I delete my account?',
        'Go to Settings, then Privacy and data. We wait 14 days before deleting, so you can change your mind.',
      ],
    ],
  },
  {
    title: 'Teaching',
    items: [
      [
        'What do instructors earn?',
        'You keep 97% of sales from your own links and coupons, and at least 50% of sales we bring you. See Teach on Tokslearn for details.',
      ],
      [
        'When do I get paid?',
        'On the 5th of each month, to your Nigerian bank account, once your available balance is at least ₦5,000.',
      ],
    ],
  },
]

export default function HelpPage() {
  return (
    <>
      <PageHeader
        title="Help"
        description="Quick answers. If yours isn't here, email support@tokslearn.com and a person will reply."
      />
      <div className="mx-auto grid max-w-page gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <nav aria-label="Help topics" className="hidden lg:block">
          <ul className="sticky top-24 flex flex-col gap-0.5">
            {topics.map((t) => (
              <li key={t.title}>
                <a
                  href={`#${t.title.toLowerCase().replace(/\s+/g, '-')}`}
                  className="flex min-h-10 items-center rounded-control px-3 text-body-sm text-ink-2 hover:bg-surface-sunken hover:text-ink"
                >
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex max-w-[760px] flex-col gap-10">
          {topics.map((t) => (
            <section
              key={t.title}
              id={t.title.toLowerCase().replace(/\s+/g, '-')}
              aria-labelledby={`${t.title}-title`}
              className="scroll-mt-24"
            >
              <h2 id={`${t.title}-title`} className="text-h3 text-ink">
                {t.title}
              </h2>
              <div className="mt-4 divide-y divide-border rounded-card border border-border bg-surface">
                {t.items.map(([q, a]) => (
                  <details key={q} className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 text-body font-medium text-ink [&::-webkit-details-marker]:hidden">
                      {q}
                      <span
                        aria-hidden
                        className="text-h3 leading-none text-ink-3 transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="px-5 pb-5 text-body text-ink-2">{a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
