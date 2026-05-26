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
   * Privy App ID — the same value as NEXT_PUBLIC_PRIVY_APP_ID on the
   * frontend but without the NEXT_PUBLIC_ prefix (backend-only).
   */
  PRIVY_APP_ID: z.string().min(1, 'PRIVY_APP_ID is required for auth (ADR-0005)'),

  /**
   * Privy App Secret — server-side only. Never expose to frontend.
   */
  PRIVY_APP_SECRET: z.string().min(1, 'PRIVY_APP_SECRET is required for auth (ADR-0005)'),

  /**
   * Privy verification key (SPKI PEM string) — found in the Privy Dashboard
   * under App Settings > Verification Key. Used by `verifyAccessToken()` to
   * verify the Privy-issued JWT without a network call.
   */
  PRIVY_VERIFICATION_KEY: z
    .string()
    .min(1, 'PRIVY_VERIFICATION_KEY is required for Privy token verification'),

  /**
   * ES256 private key in PEM format for signing OpenTrade JWTs.
   * Per rule 50: must be ES256 (not HS256). In production, loaded from
   * AWS Secrets Manager at deploy time.
   */
  JWT_PRIVATE_KEY_PEM: z.string().min(1, 'JWT_PRIVATE_KEY_PEM is required for ES256 JWT signing'),

  /**
   * ES256 public key in PEM format for verifying OpenTrade JWTs.
   */
  JWT_PUBLIC_KEY_PEM: z
    .string()
    .min(1, 'JWT_PUBLIC_KEY_PEM is required for ES256 JWT verification'),

  /**
   * Default tenant UUID for the HK market. Phase 1 only has one tenant;
   * multi-tenant routing lands in Phase 3+.
   */
  DEFAULT_TENANT_ID: z.string().uuid('DEFAULT_TENANT_ID must be a valid UUID'),

  /**
   * Pinata JWT for IPFS pinning (per ADR-0019 D1: review content on IPFS,
   * hash on-chain). Obtain from https://app.pinata.cloud/developers/api-keys.
   */
  PINATA_JWT: z.string().min(1, 'PINATA_JWT is required for IPFS review pinning'),

  /**
   * Pinata gateway base URL used by the read-side IPFS proxy endpoint
   * (`GET /v1/reviews/:id/ipfs-content`). Defaults to the public Pinata
   * gateway. Override with a dedicated gateway URL
   * (`https://<subdomain>.mypinata.cloud/ipfs/`) for higher rate limits
   * or pre-signed access. Must end with a trailing slash so the CID is
   * appended directly.
   */
  PINATA_GATEWAY_URL: z.string().url().default('https://gateway.pinata.cloud/ipfs/'),

  /**
   * RPC URL for the target chain. Used by the outbox worker to submit
   * on-chain transactions. Defaults to Base Sepolia public RPC.
   */
  CHAIN_RPC_URL: z.string().url().optional(),

  /**
   * Private key of the relayer wallet that submits on-chain transactions
   * (review anchoring, SBT minting). Must be a hex string with 0x prefix.
   * Only required when running the outbox worker task.
   */
  CHAIN_RELAYER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),

  /**
   * Address of the deployed ReviewRegistry proxy contract. Required for
   * the outbox worker to anchor reviews on-chain.
   */
  REVIEW_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /**
   * Address of the deployed KolSignalRegistry proxy contract. Required for
   * the outbox worker to anchor KOL signals on-chain (ADR-0036 D4).
   */
  KOL_SIGNAL_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /**
   * DeepL API key for UGC translation.
   *
   * @deprecated Per ADR-0027 (supersedes ADR-0023): the submit-time
   * auto-translation path has been removed and `DeepLTranslationService`
   * is no longer instantiated. The env slot is kept optional and unused so
   * a future on-demand-translation ADR (ADR-0027 D7) can rewire it without
   * an env-schema change. Setting this variable currently has no effect.
   */
  DEEPL_API_KEY: z.string().optional(),

  /**
   * S3 bucket for static assets (logos, avatars). Used by admin upload
   * endpoints. Bucket is `opentrade-dev-assets-{account_id}` per terraform.
   */
  ASSETS_BUCKET_NAME: z.string().optional(),

  /**
   * CloudFront CDN URL for the assets bucket. Returned as the public URL
   * after uploading to S3. Example: `https://d1234.cloudfront.net`.
   */
  ASSETS_CDN_URL: z.string().url().optional(),

  /**
   * AWS region for S3 operations. Defaults to ap-southeast-1 per rule 80.
   */
  AWS_REGION: z.string().default('ap-southeast-1'),
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
