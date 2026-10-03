/** Five stars, filled to the rating, with the number for screen readers. */
export function Stars({ rating, className = '' }: { rating: number; className?: string }) {
  const full = Math.round(rating)
  return (
    <span className={`inline-flex text-ink ${className}`}>
      <span aria-hidden>
        {'★'.repeat(full)}
        <span className="text-border-strong">{'★'.repeat(5 - full)}</span>
      </span>
      <span className="sr-only">{rating.toFixed(1).replace('.0', '')} out of 5</span>
    </span>
  )
}
