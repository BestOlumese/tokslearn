import { formatNaira } from '@/lib/format'

/** Price in naira with the old price struck through when set (docs/20 purchase panel). */
export function Price({
  priceKobo,
  compareAtKobo,
  size = 'md',
}: {
  priceKobo: string
  compareAtKobo: string | null
  size?: 'md' | 'lg'
}) {
  const free = priceKobo === '0'
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={size === 'lg' ? 'text-h1-sm text-ink' : 'text-body font-semibold text-ink'}>
        {free ? 'Free' : formatNaira(priceKobo)}
      </span>
      {!free && compareAtKobo ? (
        <span className="text-body-sm text-ink-3 line-through">
          <span className="sr-only">Was </span>
          {formatNaira(compareAtKobo)}
        </span>
      ) : null}
    </span>
  )
}
