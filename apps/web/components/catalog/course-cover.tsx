/**
 * 16:9 course cover. A plain <img>: covers come from our CDN at the uploaded size, and next/image
 * would add ~5 KB of client JS to every catalog page for no gain (ADR-032). `sizes` is kept for
 * the resized variants (srcset) that arrive with the image pipeline (docs/09 §5).
 */
export function CourseCover({
  src,
  alt,
  priority = false,
  sizes,
  className,
}: {
  src: string | null
  alt: string
  priority?: boolean
  sizes: string
  className?: string
}) {
  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-card bg-surface-sunken ${className ?? ''}`}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: see above
        <img
          src={src}
          alt={alt}
          width={1280}
          height={720}
          sizes={sizes}
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div aria-hidden className="flex size-full items-end bg-brand-soft p-3">
          <span className="line-clamp-2 text-body-sm font-semibold text-brand-ink">{alt}</span>
        </div>
      )}
    </div>
  )
}
