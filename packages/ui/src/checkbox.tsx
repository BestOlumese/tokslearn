import type { ComponentProps } from 'react'
import { cn } from './cn'

/** Shared by Checkbox and Radio. Each adds its own shape, checked fill and mark. */
export const choiceBase = cn(
  'peer relative size-5 shrink-0 cursor-pointer appearance-none border border-border-strong bg-surface',
  'transition-colors duration-150 hover:border-ink-3',
  'disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-danger',
)

// White check drawn as a background image. URL-encoded without quotes so Tailwind can read it.
const checkmark =
  'checked:bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2016%2016%27%3E%3Cpath%20d=%27M3.5%208.5l3%203%206-7%27%20fill=%27none%27%20stroke=%27white%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27/%3E%3C/svg%3E)]'

/** Native checkbox: works without JS and in every form. */
export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        choiceBase,
        'rounded-[4px] bg-center bg-no-repeat bg-size-[14px] checked:border-brand checked:bg-brand',
        checkmark,
        className,
      )}
      {...props}
    />
  )
}
