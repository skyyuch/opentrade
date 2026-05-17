/**
 * Motion tokens.
 *
 * Per ADR-0011 OpenTrade animations are 150-250ms ease-out, used sparingly.
 * Components must respect `prefers-reduced-motion` (handled in `globals.css`).
 */

export const transitionDuration = {
  fast: '150ms',
  base: '250ms',
  slow: '400ms',
} as const;

export const transitionTimingFunction = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  in: 'cubic-bezier(0.7, 0, 0.84, 0)',
} as const;
