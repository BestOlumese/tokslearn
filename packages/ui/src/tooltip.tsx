'use client'
// Client component: Radix handles hover/focus delay and aria-describedby wiring.

import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

export const TooltipProvider = TooltipPrimitive.Provider

/** Required on icon-only buttons alongside aria-label (docs/11 §4). */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  ...props
}: Omit<ComponentProps<typeof TooltipPrimitive.Content>, 'content'> & {
  content: ReactNode
  children: ReactNode
}) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-50 max-w-60 rounded-control bg-ink px-2.5 py-1.5 text-caption text-ink-inverse',
            'data-[state=delayed-open]:animate-fade-in data-[state=closed]:animate-fade-out',
            className,
          )}
          {...props}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
