/**
 * Vitest configuration for `@opentrade/web`.
 *
 * The component-test surface uses `jsdom` (per cursor rule 60 §Component
 * Test) because most rendered pieces are React components that touch `window`
 * / `document` indirectly via Tailwind, `next-themes`, or `next-intl`.
 *
 * Coverage thresholds are lower than the API workspace because most page-level
 * code is integration-territory (server components, layouts, middleware) that
 * we deliberately exclude from coverage and exercise via Playwright in M6.3
 * instead.
 *
 * The `@/` path alias is duplicated from `tsconfig.json` in `resolve.alias`
 * as a fast-path: `vite-tsconfig-paths` plugin handles it too, but an
 * explicit Vite alias short-circuits the resolver in hot test files.
 */

import { resolve } from 'node:path';

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
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
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
        'src/**/layout.tsx',
        'src/**/page.tsx',
        'src/**/loading.tsx',
        'src/**/error.tsx',
        'src/**/not-found.tsx',
        'src/middleware.ts',
        'src/i18n/**',
        'src/env.ts',
      ],
      // Thresholds intentionally not set in M6.0. apps/web's user-flow
      // realism lives in Playwright (M6.3); only thin client-side helpers
      // get unit tests. A future commit raises this once the helper layer
      // (`lib/api/*`, hooks/*) has enough coverage to make the floor
      // meaningful.
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
