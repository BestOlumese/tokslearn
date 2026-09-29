'use client'
// Client component: an embedded video player (Bunny iframe) that stops when Next hides the page.
// With Cache Components, pages you leave stay mounted but hidden (Activity), and a hidden iframe
// keeps playing. Blank it on hide; load it again when the page shows.

import { type ComponentProps, useLayoutEffect, useRef } from 'react'

export function EmbedFrame({ src, ...props }: ComponentProps<'iframe'> & { src: string }) {
  'use no memo' // Tiny island on public pages: skip the compiler's memo cache.
  const ref = useRef<HTMLIFrameElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.getAttribute('src') !== src) el.setAttribute('src', src)
    return () => el?.setAttribute('src', 'about:blank')
  }, [src])
  return <iframe ref={ref} src={src} {...props} />
}
