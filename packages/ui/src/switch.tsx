import type { ComponentProps } from 'react'
import { cn } from './cn'

/**
 * Native checkbox with role="switch": announced as on/off, works without JS.
 * Pair with a visible <label>.
 */
export function Switch({ className, ...props }: Omit<ComponentProps<'input'>, 'type' | 'role'>) {
  return (
    <input
      type="checkbox"
      // biome-ignore lint/a11y/useAriaPropsForRole: a native checkbox exposes its state via `checked`; ARIA in HTML forbids adding aria-checked here.
      role="switch"
      className={cn(
        'peer relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full bg-border-strong',
        'transition-colors duration-150 ease-out hover:bg-ink-3 checked:bg-brand checked:hover:bg-brand-hover',
        'before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-surface',
        'before:transition-transform before:duration-150 before:ease-out checked:before:translate-x-4',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}
