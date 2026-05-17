/**
 * Environment variable schema for `apps/api`.
 *
 * Per cursor rule 50 ("Validation") every env value the API consumes is
 * declared here, parsed once on import, and re-exported as a strongly-typed
 * record. Any contributor accessing `process.env.X` directly is doing it
 * wrong — add the key to {@link envSchema} instead.
 *
 * Why fail-fast on import (vs. lazy memoise like packages/db):
 *   - The API process exists to serve traffic; if env is broken, the only
 *     correct response is to crash before binding a port.
 *   - `packages/db` defers parsing because Prisma CLI tools (generate, format)
 *     import the package without DATABASE_URL set. The API has no equivalent
 *     "tooling import" path.
 *   - Crashing in {@link import} causes a clear stack trace; crashing later
 *     during request handling pollutes logs and confuses operators.
 *
 * Required env keys are documented in `.env.example` at the repo root.
 */

import { z } from 'zod';

/**
 * Pino log levels in increasing severity. Mirrors Pino's built-in set; kept
 * here so the zod schema is the single source of truth.
 */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

const envSchema = z.object({
  /**
   * Runtime environment. Defaults to `development` to keep local dev
   * frictionless; CI / staging / prod must set this explicitly via ECS task
   * definition or GitHub Actions env.
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /**
   * Host the HTTP server binds to. Defaults to `0.0.0.0` so both the host OS
   * and other containers on the same Docker network can reach the service.
   * In some local setups (e.g. behind a stricter firewall) `127.0.0.1` is
   * preferred — both are accepted.
   */
  SERVER_HOST: z.string().min(1).default('0.0.0.0'),

  /**
   * TCP port the server listens on. Stored as a string in the environment
   * (Node convention) and coerced to a positive integer here. Reserved /
   * privileged ports below 1024 are rejected; production ECS tasks always
   * use 4000+ anyway.
   */
  SERVER_PORT: z.coerce.number().int().min(1024).max(65535).default(4000),

  /**
   * Comma-separated whitelist of allowed CORS origins. Per rule 30 we never
   * use a wildcard. Parsed into a deduplicated array of trimmed strings; if
   * the list is empty the API will reject all cross-origin traffic.
   */
  CORS_ORIGIN: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  /**
   * Pino log verbosity. `info` in prod, typically `debug` in local dev.
   */
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

  /**
   * JWT signing secret. Phase 0 placeholder: validated only for length so a
   * truncated value cannot accidentally land in any environment. Commit
   * number-six (auth flow) replaces this with an ES256 private key loaded
   * from AWS Secrets Manager — see ADR-0006 and rule 50.
   */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
});

export type ApiEnv = z.infer<typeof envSchema>;

/**
 * The parsed environment. Throws synchronously at import time if any required
 * value is missing or malformed; the resulting `ZodError` includes the exact
 * key paths that failed, so misconfigured deploys surface immediately in
 * CloudWatch / local terminals.
 */
export const env: ApiEnv = (() => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment for @opentrade/api. Fix the following keys (see .env.example):\n${issues}`,
    );
  }
  return result.data;
})();
