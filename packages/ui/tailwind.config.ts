/**
 * Tailwind config used **only** by `@opentrade/ui`'s own Storybook build.
 * Apps must supply their own `tailwind.config.ts` extending the preset.
 */
import preset from './tailwind.preset';

import type { Config } from 'tailwindcss';

const config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx,mdx}', './.storybook/**/*.{ts,tsx}'],
} satisfies Config;

export default config;
