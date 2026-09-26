import type { ComponentProps } from 'react'
import { cn } from './cn'
import { controlClasses } from './input'

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea rows={rows} className={cn(controlClasses, 'min-h-20 py-2', className)} {...props} />
  )
}
