/**
 * Vitest configuration for `@opentrade/ui`.
 *
 * The design-system workspace tests its primitives (and a subset of
 * compounds) under jsdom because every test mounts a real React tree
 * via @testing-library/react. Stories themselves are exercised in
 * Storybook's interactions panel; this config covers the CI-gated
 * RTL + axe-core layer that runs in `pnpm test:unit`.
 *
 * Coverage thresholds intentionally not set in M6.2b — first the badge
 * + picker tests land, then a follow-up commit ratchets the floor up
 * once primitives have enough mass to make the number meaningful. Per
 * rule 60 the long-term floor is 80% lines for `packages/ui`.
 */

import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/storybook-static/**',
      'src/**/*.stories.{ts,tsx}',
    ],
    setupFiles: ['./vitest.setup.ts'],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.mdx',
        'src/stories/**',
        'src/design-tokens/**',
        'src/styles/**',
      ],
    },
  },
});
