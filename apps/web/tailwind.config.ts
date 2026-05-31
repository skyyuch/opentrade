/**
 * `apps/web` Tailwind config — extends the shared preset from
 * `@opentrade/ui/tailwind-preset` (the single source of truth for
 * design tokens per ADR-0011) and only adds the content paths that
 * Tailwind must scan for class names.
 *
 * Per cursor rule 22, apps MUST NOT redefine theme tokens here. If a
 * design value is missing, add it to `packages/ui/src/design-tokens/`
 * and re-export through the preset.
 */

import typography from '@tailwindcss/typography';

import preset from '@opentrade/ui/tailwind-preset';

import type { Config } from 'tailwindcss';

const config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx,mdx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  // The `prose` utilities render KOL analyst-note rich text (ADR-0039); the
  // editor + viewer use `prose prose-invert`. Plugins (unlike theme tokens,
  // per rule 22) are an app-level concern, so the typography plugin is
  // registered here rather than in the shared preset.
  plugins: [typography],
} satisfies Config;

export default config;
