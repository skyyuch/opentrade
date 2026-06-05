/**
 * Vitest configuration for `@opentrade/console`.
 *
 * Mirrors `apps/web/vitest.config.ts` (per ADR-0042 + cursor rule 60): a
 * jsdom environment for React component tests, the same `@/` alias as
 * `tsconfig.json`, and a single deduped React copy across the
 * `@opentrade/ui` workspace boundary.
 *
 * The console had no test harness before the bullion-vertical §6 work
 * (ADR-0045): the admin broker category filter (D7) is the first console
 * surface that warrants a component test, so this config stands up the
 * minimum needed and leaves coverage thresholds unset until a meaningful
 * console helper layer exists (same posture as apps/web).
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
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**'],
    setupFiles: ['./vitest.setup.ts'],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    css: false,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
