import { cn } from './cn'

const sizes = {
  sm: 'size-8 text-caption',
  md: 'size-10 text-body-sm',
  lg: 'size-16 text-h4',
} as const

export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

/**
 * Photo with explicit dimensions (no layout shift), initials when there is none.
 * Real instructor photos only; never stock people (docs/11 §6.9).
 */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof sizes
  className?: string
}) {
  const px = size === 'sm' ? 32 : size === 'md' ? 40 : 64
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-sunken font-semibold text-ink-2',
        sizes[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} width={px} height={px} className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={name}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}
