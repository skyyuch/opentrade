/**
 * Vitest setup for `@opentrade/api`.
 *
 * Runs once before any test file is evaluated. The single job is to satisfy
 * the env-zod fail-fast in `src/shared/env.ts` so that test files importing
 * (transitively or directly) any code path that touches `env` does not crash
 * at module-load time.
 *
 * The values here are intentionally syntactic placeholders — never real
 * secrets — chosen to pass the zod regexes and `min(1)` constraints. Any
 * test that actually needs to exercise env-driven behaviour (e.g. CORS
 * whitelist parsing) should override the relevant key inside its own
 * `beforeEach` and restore in `afterEach`.
 *
 * Why this lives in a setup file rather than a shared fixture:
 *   - `setupFiles` are executed by Vitest *before* it transforms or imports
 *     any test module. A fixture would run too late (after module import).
 *   - Keeps the env contract co-located with the env schema's owner
 *     workspace; no other workspace should need to know about this stub.
 */

process.env['NODE_ENV'] = 'test';
process.env['SERVER_HOST'] = '127.0.0.1';
process.env['SERVER_PORT'] = '4000';
process.env['CORS_ORIGIN'] = 'http://localhost:3000';
process.env['LOG_LEVEL'] = 'error';
process.env['PRIVY_APP_ID'] = 'test-privy-app-id';
process.env['PRIVY_APP_SECRET'] = 'test-privy-app-secret';
process.env['PRIVY_VERIFICATION_KEY'] =
  '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest\n-----END PUBLIC KEY-----';
process.env['JWT_PRIVATE_KEY_PEM'] =
  '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgtest\n-----END PRIVATE KEY-----';
process.env['JWT_PUBLIC_KEY_PEM'] =
  '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest\n-----END PUBLIC KEY-----';
process.env['DEFAULT_TENANT_ID'] = '00000000-0000-4000-8000-000000000000';
process.env['PINATA_JWT'] = 'test-pinata-jwt';
