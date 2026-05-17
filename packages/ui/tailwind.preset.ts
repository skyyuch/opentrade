/**
 * OpenTrade Tailwind preset — shared by every consumer (Storybook, apps/web,
 * apps/console). Per ADR-0011 design tokens are the single source of truth;
 * this preset wires them into Tailwind's theme.
 *
 * Consumers extend the preset and only add app-specific content paths:
 *
 *   // apps/web/tailwind.config.ts
 *   import preset from '@opentrade/ui/tailwind-preset';
 *   export default {
 *     presets: [preset],
 *     content: ['./src/**\/*.{ts,tsx}', '../../packages/ui/src/**\/*.{ts,tsx}'],
 *   };
 */

import animate from 'tailwindcss-animate';

import {
  borderRadius,
  boxShadow,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  palette,
  screens,
  spacing,
  transitionDuration,
  transitionTimingFunction,
  zIndex,
} from './src/design-tokens';

import type { Config } from 'tailwindcss';

/**
 * Wrap each palette stop in `hsl(<triplet> / <alpha-value>)` so Tailwind's
 * opacity modifier (`bg-sapphire-500/40`) works on raw palette utilities too.
 */
const withAlpha = <T extends Record<string, string>>(scale: T): Record<keyof T, string> => {
  const out = {} as Record<keyof T, string>;
  for (const key of Object.keys(scale) as (keyof T)[]) {
    const value = scale[key];
    if (value === undefined) continue;
    out[key] = `hsl(${value} / <alpha-value>)`;
  }
  return out;
};

const preset = {
  darkMode: ['class'],
  // Consumers MUST supply their own `content` array; this preset intentionally
  // leaves it empty so it doesn't accidentally pull in unrelated files.
  content: [],
  theme: {
    screens: { ...screens },
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        sapphire: withAlpha(palette.sapphire),
        gilded: withAlpha(palette.gilded),
        emerald: withAlpha(palette.emerald),
        vermilion: withAlpha(palette.vermilion),
        amber: withAlpha(palette.amber),
        neutral: withAlpha(palette.neutral),

        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger) / <alpha-value>)',
          foreground: 'hsl(var(--danger-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        chain: {
          ink: 'hsl(var(--chain-ink) / <alpha-value>)',
          bg: 'hsl(var(--chain-bg) / <alpha-value>)',
          border: 'hsl(var(--chain-border) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [...fontFamily.sans],
        serif: [...fontFamily.serif],
        mono: [...fontFamily.mono],
        display: [...fontFamily.display],
      },
      fontSize: { ...fontSize },
      fontWeight: { ...fontWeight },
      letterSpacing: { ...letterSpacing },
      spacing: { ...spacing },
      borderRadius: {
        ...borderRadius,
        DEFAULT: 'var(--radius)',
      },
      boxShadow: { ...boxShadow },
      transitionDuration: { ...transitionDuration },
      transitionTimingFunction: { ...transitionTimingFunction },
      zIndex: { ...zIndex },
    },
  },
  plugins: [animate],
} satisfies Partial<Config>;

// Tailwind requires the preset to be a default export.
export default preset;
