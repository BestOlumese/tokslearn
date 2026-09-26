import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger'
/** 36 / 40 / 48 px. `lg` is for checkout only (docs/11 §4). */
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-ink-inverse hover:bg-brand-hover active:bg-brand-press',
  secondary:
    'bg-surface text-ink border border-border-strong hover:bg-canvas active:bg-surface-sunken',
  tertiary: 'text-brand-ink hover:bg-brand-soft active:bg-brand-soft',
  danger: 'bg-danger text-ink-inverse hover:brightness-90 active:brightness-[0.82]',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-body-sm gap-1.5',
  md: 'h-10 px-4 text-body gap-2',
  lg: 'h-12 px-6 text-body-lg gap-2',
}

export const buttonClasses = ({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  className?: string | undefined
} = {}) =>
  cn(
    // `after:` widens the hit area to ≥44 px on touch without changing layout (docs/11 §8).
    'relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-medium',
    'transition-colors duration-150 ease-out after:absolute after:-inset-1 after:content-[""]',
    'disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40',
    '[&_svg]:size-4 [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    className,
  )

/** For links styled as buttons, use `buttonClasses()` on a Next.js <Link>. */
export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner in place of `icon` and keeps the button width. */
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant,
  size,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = buttonClasses({ variant, size, className })
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner label="Working…" /> : icon}
      {children}
    </button>
  )
}
