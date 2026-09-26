'use client'
// Client component: toasts are imperative and live in a single client-side region.

import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { Toaster as Sonner, toast } from 'sonner'

/** One region per page, bottom-right on desktop, bottom-center on phones (docs/20 §0). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={24}
      mobileOffset={16}
      gap={8}
      visibleToasts={3}
      icons={{
        success: <CircleCheck aria-hidden strokeWidth={1.75} className="size-5 text-success" />,
        error: <CircleAlert aria-hidden strokeWidth={1.75} className="size-5 text-danger" />,
        info: <Info aria-hidden strokeWidth={1.75} className="size-5 text-info" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[min(360px,calc(100vw-32px))] items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-pop',
          title: 'text-body-sm font-medium text-ink',
          description: 'text-body-sm text-ink-2',
          actionButton:
            'ml-auto shrink-0 rounded-control px-2 py-1 text-body-sm font-medium text-brand-ink hover:bg-brand-soft',
        },
      }}
    />
  )
}

export { toast }
