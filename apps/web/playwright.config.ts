/**
 * Playwright configuration for `@opentrade/web`'s e2e suite.
 *
 * Scope (M6.3b): the read-path on `/brokers/:slug` is exercised in a
 * real browser. Write-path (review submission) lives in the Vitest +
 * RTL `ReviewForm.test.tsx` suite — see that file's JSDoc for the
 * rationale on why Playwright is not the right layer for the write-path
 * (would force a 250-line Privy OAuth fixture that bites every SDK
 * upgrade).
 *
 * Stub strategy: a zero-dependency Node HTTP server in
 * `e2e/fixtures/api-stub.ts` returns the seed broker + four reviews
 * (POSITIVE / NEUTRAL / NEGATIVE / null-legacy). Next.js is started
 * with `NEXT_PUBLIC_API_URL` pointing at the stub so Server Component
 * fetches land there. This satisfies cursor rule 60 ("no real on-chain
 * interaction in e2e") and rule 50 ("no test-only backdoors in
 * production code") simultaneously.
 *
 * Privy env vars are seeded with placeholder values so the env zod
 * schema passes startup. The unauthenticated CTA path is the only flow
 * exercised, so the Privy SDK never actually performs OAuth.
 */
import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 3030);
const STUB_PORT = Number(process.env['E2E_API_STUB_PORT'] ?? 4010);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `tsx ${'./e2e/fixtures/api-stub.ts'}`,
      env: { API_STUB_PORT: String(STUB_PORT) },
      port: STUB_PORT,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `next dev --port ${WEB_PORT}`,
      env: {
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${STUB_PORT}`,
        NEXT_PUBLIC_PRIVY_APP_ID: 'e2e-placeholder-privy-app',
        NEXT_PUBLIC_CHAIN_ID: '84532',
      },
      port: WEB_PORT,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
