/**
 * Vitest configuration for `@opentrade/api`.
 *
 * Per cursor rule 60 (testing) this workspace's unit tests target:
 *   - domain layer: ≥ 90% line coverage (pure functions, no I/O)
 *   - application layer: ≥ 85% (use cases with mocked ports)
 *   - infrastructure layer: ≥ 70% (mostly verified by integration tests
 *     using testcontainers, out of scope for this config)
 *
 * The single global threshold below sits at 85% (application baseline).
 * Stricter domain-only enforcement is opt-in via a future CI matrix step
 * that narrows `coverage.include` to the per-domain `domain/` folders, once
 * we have enough domain tests to make the gate meaningful; Vitest 3.x has
 * no native per-glob threshold yet, so a single global floor is the
 * cleanest knob today.
 *
 * Network access is disallowed in unit tests (rule 60 §嚴禁): tests must
 * either mock the dependency interface (`vitest-mock-extended` for ports)
 * or skip real HTTP / DB / chain calls entirely.
 */

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
    setupFiles: ['./vitest.setup.ts'],
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
        'src/main.ts',
        'src/tasks/**',
        'src/shared/env.ts',
      ],
      // Thresholds intentionally not set in M6.0. The first real test for
      // each layer lands in M6.1 (`SubmitReviewUseCase`, sentiment
      // aggregate). Once each layer has at least one meaningful covered
      // file, a follow-up commit (tracked in `docs/03-status.md`) ratchets
      // the thresholds up to rule 60's targets — domain ≥ 90%,
      // application ≥ 85%, infrastructure ≥ 70%. Enabling them now would
      // make the M6.0 bootstrap fail before any domain test exists.
    },
  },
});
