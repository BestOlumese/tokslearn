import Link from 'next/link'

/** "Tokslearn" set in Figtree 700. No icon, no gradient (docs/phases/phase-00 §0.5). */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      translate="no"
      className={`inline-flex h-11 items-center text-[1.375rem] leading-none font-bold tracking-[-0.02em] text-ink ${className}`}
    >
      Tokslearn
    </Link>
  )
}
