// Left panel of the auth screens on large displays: four plain facts about buying and learning
// on Tokslearn (docs/01, ADR-004, docs/07 §5). No imagery, no claims we can't back.

const facts = [
  {
    value: '₦ Naira',
    title: 'Local prices',
    body: 'Pay by card, bank transfer or USSD through Paystack.',
  },
  {
    value: '0–14 days',
    title: 'Refund window',
    body: 'Every course shows its refund rules before you pay.',
  },
  {
    value: 'BVN or NIN',
    title: 'Checked instructors',
    body: 'Instructors confirm who they are before they can sell.',
  },
  {
    value: 'One code',
    title: 'Certificates',
    body: 'Employers can check yours at tokslearn.com/verify.',
  },
] as const

export function AuthInfoPanel() {
  return (
    <aside
      aria-labelledby="auth-info-title"
      className="hidden bg-brand-soft lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-20"
    >
      <div className="max-w-[520px]">
        <h2 id="auth-info-title" className="text-h2 text-brand-ink">
          What you get on Tokslearn
        </h2>
        <dl className="mt-8 grid grid-cols-2 gap-4">
          {facts.map((f) => (
            <div key={f.title} className="rounded-card border border-border bg-surface p-5">
              <dt>
                <span className="block text-h3 text-ink tabular-nums">{f.value}</span>
                <span className="mt-2 block text-body-sm font-semibold text-ink">{f.title}</span>
              </dt>
              <dd className="mt-1 text-body-sm text-ink-2">{f.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-body-sm text-ink-2">
          Questions before you start?{' '}
          <a href="/help" className="font-medium text-brand-ink underline underline-offset-4">
            Read the help page
          </a>
        </p>
      </div>
    </aside>
  )
}
