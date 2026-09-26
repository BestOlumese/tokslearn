import Link from 'next/link'

const classes =
  'inline-flex h-11 items-center text-[1.375rem] leading-none font-bold tracking-[-0.02em] text-ink'

/**
 * "Tokslearn" set in Figtree 700. No icon, no gradient (docs/phases/phase-00 §0.5).
 * `plain` renders a normal anchor: auth screens skip the client Link runtime (docs/12 §1).
 */
export function Wordmark({ plain = false }: { plain?: boolean }) {
  if (plain) {
    return (
      <a href="/" translate="no" className={classes}>
        Tokslearn
      </a>
    )
  }
  return (
    <Link href="/" translate="no" className={classes}>
      Tokslearn
    </Link>
  )
}
