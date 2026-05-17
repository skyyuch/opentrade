/**
 * Environment variable schema for `@opentrade/db`.
 *
 * Per cursor rule 50 ("Validation"), every env value the package consumes is
 * declared here and parsed exactly once at first access. This avoids stray
 * `process.env.X` references scattered across the codebase and guarantees
 * a meaningful error message if a required value is missing.
 *
 * Why a getter instead of top-level `parse`:
 *   - `prisma generate` and `prisma format` run without DATABASE_URL set;
 *     importing this module under those tools would otherwise throw.
 *   - Lazily memoising means production startup still fails fast (the
 *     PrismaClient constructor reads env on first instantiation).
 */

import { z } from 'zod';

const PG_URL_PATTERN = /^postgres(?:ql)?:\/\//;

const envSchema = z.object({
  /**
   * Application environment. Defaults to `development` to keep local dev
   * frictionless; CI / prod must set this explicitly via deployment config.
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /**
   * Primary read/write connection string. Must be a `postgresql://` or
   * `postgres://` URL. In production this is injected from AWS Secrets Manager
   * (ADR-0002); locally it points at the docker-compose Postgres (ADR-0012).
   */
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((value) => PG_URL_PATTERN.test(value), {
      message: 'DATABASE_URL must start with postgres:// or postgresql://',
    }),

  /**
   * Optional read-replica connection string. Used by `prismaReadOnly` for
   * heavy read traffic (broker lists, review feeds). Locally we fall back to
   * `DATABASE_URL` so the read path is still exercised against the same DB.
   */
  DATABASE_READ_URL: z
    .string()
    .min(1)
    .refine((value) => PG_URL_PATTERN.test(value), {
      message: 'DATABASE_READ_URL must start with postgres:// or postgresql://',
    })
    .optional(),
});

export type DbEnv = z.infer<typeof envSchema>;

let cachedEnv: DbEnv | null = null;

/**
 * Returns the parsed and validated env for this package.
 *
 * Memoised — calling this many times is cheap. Throws `ZodError` with field
 * paths if any value is invalid; the message is intentionally verbose so
 * misconfiguration is obvious in CloudWatch / local terminals.
 */
export const getDbEnv = (): DbEnv => {
  if (cachedEnv !== null) {
    return cachedEnv;
  }
  cachedEnv = envSchema.parse(process.env);
  return cachedEnv;
};
