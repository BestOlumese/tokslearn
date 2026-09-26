import { cn } from './cn'

/** 6 px bar, brand fill on a sunken track, percentage next to it (docs/11 §4). */
export function Progress({
  value,
  label,
  showValue = true,
  className,
}: {
  /** 0–100 */
  value: number
  label: string
  showValue?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full origin-left rounded-full bg-brand transition-transform duration-150 ease-out"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
      {showValue ? (
        <span className="w-10 text-right text-body-sm text-ink-2 tabular-nums">{pct}%</span>
      ) : null}
    </div>
  )
}
