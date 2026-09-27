import { COVER_WIDTHS, resized, srcSet } from '@/lib/image'

/**
 * 16:9 course cover. A plain <img> with a srcset of resized WebPs from /_next/image: the browser
 * picks the width from `sizes`, and next/image's ~5 KB of client JS stays off catalog pages
 * (ADR-032).
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
          src={resized(src, 640)}
          srcSet={srcSet(src, COVER_WIDTHS)}
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
