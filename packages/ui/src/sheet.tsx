'use client'
// Client component: a Radix Dialog presented as a side or bottom panel.

import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'
import { overlayClasses } from './dialog'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

const sides = {
  right:
    'inset-y-0 right-0 h-dvh w-[min(420px,calc(100vw-48px))] border-l data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
  bottom:
    'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-dialog border-t data-[state=open]:animate-slide-in-bottom data-[state=closed]:animate-slide-out-bottom',
} as const

export function SheetContent({
  side = 'right',
  title,
  description,
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: keyof typeof sides
  title: string
  description?: ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain border-border bg-surface p-6 shadow-pop',
          sides[side],
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-h3 text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-body-sm text-ink-2">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-m-2 inline-flex size-10 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-sunken hover:text-ink"
          >
            <X aria-hidden strokeWidth={1.75} className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
