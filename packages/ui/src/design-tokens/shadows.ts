/**
 * Box shadow tokens.
 *
 * Per ADR-0011 OpenTrade avoids "floating card" Material Design shadows; we
 * rely on hairline borders + background elevation. The few shadows here are
 * intentionally subtle and used for popovers / modals / focus rings only.
 *
 * `hairline` is a fake border via inset shadow — useful when an actual
 * `border` would shift layout (e.g. on hover states).
 */

export const boxShadow = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
  hairline: 'inset 0 0 0 1px hsl(var(--border))',
  /** Subtle glow used on dark-mode interactive states — keeps the "Web3 tech" feel without overdoing it. */
  'glow-primary': '0 0 0 1px hsl(var(--ring) / 0.4), 0 0 16px -4px hsl(var(--ring) / 0.5)',
} as const;
