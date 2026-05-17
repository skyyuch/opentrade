/**
 * Spacing scale — 4-pixel base. Only the values listed here are allowed.
 *
 * Per ADR-0011 "空白慷慨" — retail-facing screens lean towards larger spacing
 * to avoid the WikiFX-style "crammed" feel. Console screens may compress via
 * the `data-density` attribute (handled at compound level, not via tokens).
 */

export const spacing = {
  0: '0px',
  px: '1px',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  2.5: '0.625rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  14: '3.5rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  32: '8rem',
  48: '12rem',
  64: '16rem',
} as const;

export type SpacingKey = keyof typeof spacing;
