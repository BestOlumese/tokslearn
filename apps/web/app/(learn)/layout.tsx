import type { ReactNode } from 'react'

// The course player has its own top bar (course, progress, exit) instead of the site header, so
// the lesson gets the whole screen on a phone (docs/10 §3).
export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
      {children}
    </main>
  )
}
