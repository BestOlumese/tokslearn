import { cn } from './cn'

/** Only inside buttons and inline controls. Page content uses skeletons (docs/20 §0). */
export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-label={label}
      className={cn('size-4 shrink-0 animate-spin', className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.75"
      />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
