/** Home hero, right side, before the first course is live: how buying works, in plain words. */
export function BuyingFacts() {
  const facts: Array<[string, string]> = [
    ['Pay in naira', 'Card, bank transfer or USSD through Paystack. No dollar card needed.'],
    [
      'Refund rules on every course page',
      'Each course page says how many days you have to ask for your money back.',
    ],
    [
      'Certificates anyone can check',
      'Every certificate has a code. An employer enters it on Tokslearn to see that it is real.',
    ],
  ]
  return (
    <div className="rounded-dialog border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-h4 text-ink">How it works</h2>
      <dl className="mt-5 flex flex-col gap-5">
        {facts.map(([title, text], i) => (
          <div key={title} className="flex gap-4">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-body-sm font-semibold text-brand-ink"
            >
              {i + 1}
            </span>
            <div>
              <dt className="text-body font-semibold text-ink">{title}</dt>
              <dd className="mt-0.5 text-body-sm text-ink-2">{text}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  )
}
