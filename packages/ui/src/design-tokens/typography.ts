/**
 * Typography tokens.
 *
 * Per ADR-0011 OpenTrade uses:
 *   - Inter / Inter Display for Latin / numerals
 *   - JetBrains Mono for chain data (with tabular figures)
 *   - Source Han Serif / Source Han Sans for CJK (introduced Phase 0.5)
 *
 * Phase 0 ships with system CJK fallback; self-hosted fonts are added later
 * once the design partner is on board (avoids shipping ~10 MB of CJK font
 * before the brand is finalised).
 *
 * IMPORTANT: every numeric column / table cell MUST use `font-feature-settings: "tnum"`
 * via the `font-numeric` utility — otherwise finance tables jitter and that
 * single detail destroys the "trustworthy data" feeling.
 */

export const fontFamily = {
  sans: [
    'InterVariable',
    'Inter',
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    'PingFang HK',
    'PingFang TC',
    'PingFang SC',
    'Microsoft JhengHei',
    'Microsoft YaHei',
    'sans-serif',
  ],
  serif: [
    'Source Han Serif TC',
    'Source Han Serif SC',
    'Songti TC',
    'Songti SC',
    'Georgia',
    'serif',
  ],
  mono: [
    'JetBrains Mono',
    'IBM Plex Mono',
    'Menlo',
    'Monaco',
    'Consolas',
    'Liberation Mono',
    'Courier New',
    'monospace',
  ],
  display: [
    'InterDisplay',
    'InterVariable',
    'Inter',
    'system-ui',
    '-apple-system',
    'PingFang HK',
    'sans-serif',
  ],
} as const;

/**
 * Modular scale, ratio 1.25 (major third). 8 steps max — adding more sizes
 * dilutes hierarchy and is a "design smell" per ADR-0011.
 *
 * Tuple form is `[fontSize, { lineHeight }]` per Tailwind's expected shape.
 * Not marked `as const` because Tailwind's `Config['theme']['fontSize']`
 * type expects a mutable tuple, not a readonly one.
 */
export const fontSize: Record<string, [string, { lineHeight: string }]> = {
  xs: ['0.75rem', { lineHeight: '1rem' }],
  sm: ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem', { lineHeight: '1.5rem' }],
  lg: ['1.25rem', { lineHeight: '1.75rem' }],
  xl: ['1.5rem', { lineHeight: '2rem' }],
  '2xl': ['2rem', { lineHeight: '2.5rem' }],
  '3xl': ['2.5rem', { lineHeight: '3rem' }],
  '4xl': ['3.5rem', { lineHeight: '1.1' }],
};

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const letterSpacing = {
  tight: '-0.02em',
  normal: '0',
  wide: '0.02em',
  wider: '0.04em',
} as const;
