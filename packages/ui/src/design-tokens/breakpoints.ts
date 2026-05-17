/**
 * Responsive breakpoints.
 *
 * `apps/web` is mobile-first (per rule 22), so most layouts start with no
 * prefix and add `md:` / `lg:` for larger viewports.
 *
 * `apps/console` is desktop-first; it overrides defaults via `max-md:` and
 * accepts that the mobile experience is "functional, not optimised".
 *
 * `xs` (360px) is intentionally below Tailwind's default `sm` (640px) because
 * a meaningful chunk of HK retail users browse on older / smaller phones.
 */

export const screens = {
  xs: '360px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;
