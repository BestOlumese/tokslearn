// Resized public images without next/image's client JS (ADR-032). Widths and quality must match
// `images` in next.config.ts, or the optimizer refuses the request.

const cdn = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_CDN_URL ?? '').origin
  } catch {
    return null
  }
})()

export const COVER_WIDTHS = [384, 640, 828, 1200] as const
type Width = 64 | 128 | 256 | (typeof COVER_WIDTHS)[number]

/** A resized WebP of one of our CDN files; anything else (e.g. Bunny thumbnails) passes through. */
export function resized(src: string, width: Width): string {
  if (!cdn || !src.startsWith(`${cdn}/`)) return src
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=70`
}

/** `srcset` for a CDN image at the given widths, or undefined for other hosts. */
export function srcSet(src: string, widths: ReadonlyArray<Width>): string | undefined {
  if (!cdn || !src.startsWith(`${cdn}/`)) return undefined
  return widths.map((w) => `${resized(src, w)} ${w}w`).join(', ')
}
