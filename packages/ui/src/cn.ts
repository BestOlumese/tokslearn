import { type ClassValue, clsx } from 'clsx'

/**
 * Joins class names. Deliberately not tailwind-merge (11 KB gzipped on every page): components
 * expose props for variants, and a caller's `className` only adds layout (margin, width, grid
 * placement). It must never restate a property the component already sets.
 */
export const cn = (...inputs: ClassValue[]): string => clsx(inputs)
