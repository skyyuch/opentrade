import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditionally join Tailwind class names with conflict resolution.
 *
 * Combines `clsx` (boolean / array / object inputs) with `tailwind-merge`
 * (later utility wins when two classes target the same CSS property,
 * e.g. `px-2 px-4` collapses to `px-4`).
 *
 * Required by rule 22 — never concatenate class strings manually.
 *
 * @example
 *   cn('rounded px-4 py-2', isPrimary && 'bg-primary text-primary-foreground')
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
