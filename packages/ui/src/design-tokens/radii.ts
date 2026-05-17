/**
 * Border radius scale.
 *
 * Per ADR-0011: 6-8px is the OpenTrade sweet spot — `none` looks too brutalist
 * for retail finance; `xl+` starts to look like a consumer app. `full` is
 * reserved for pills / avatars / SBT badges.
 */

export const borderRadius = {
  none: '0px',
  sm: '0.25rem',
  DEFAULT: '0.375rem',
  md: '0.5rem',
  lg: '0.625rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
} as const;
