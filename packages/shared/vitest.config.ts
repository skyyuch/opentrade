/**
 * Vitest configuration for `@opentrade/shared`.
 *
 * Per cursor rule 60 this workspace targets ≥ 90% line coverage because it
 * holds pure, framework-free helpers that should be trivially testable. The
 * global threshold below reflects that target — anything lower in CI is a
 * signal that helpers are growing untested branches.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts',
        // DTOs / wire contracts are pure `export type` declarations with no
        // executable code; V8 still counts them so we drop them explicitly.
        // The contract is locked by the API integration tests in apps/api,
        // not by anything in this workspace.
        'src/**/*Dto.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
