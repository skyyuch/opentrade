/**
 * Validated environment variables for `@opentrade/console`.
 *
 * Phase 0 only needs `NEXT_PUBLIC_API_URL` — every additional client-side
 * key (Privy, chain RPC, contract addresses, …) lands here as it comes
 * online so we have a single failure point if config drifts.
 *
 * This module is intentionally a copy of `apps/web/src/env.ts`. The two
 * apps share the same browser-visible config surface today, and the
 * docblock below applies identically — keep them in lock-step. When
 * console-specific client env appears (e.g. a separate Privy app id for
 * the back office), extend the schema here and document the divergence
 * in the description.
 *
 * IMPORTANT — Next.js inlining contract:
 *   `process.env.NEXT_PUBLIC_*` references are statically replaced at
 *   build time. Webpack's DefinePlugin matches BOTH dotted access
 *   (`process.env.X`) and literal-bracket access (`process.env['X']`),
 *   so the bracket form below is inlined identically. What does NOT
 *   work is destructuring (`const { NEXT_PUBLIC_API_URL } = process.env`)
 *   or computed keys (`process.env[someVar]`); both ship `undefined`
 *   into the client bundle.
 *
 *   We use the bracket form because the OpenTrade base TSConfig has
 *   `noPropertyAccessFromIndexSignature: true` (per cursor rule 20),
 *   which forbids dotted access on `Record<string, string | undefined>`.
 *
 * Per cursor rule 50 (security): NEXT_PUBLIC_* values get bundled into the
 * client; never put a secret behind that prefix. Server-only secrets live
 * in plain `process.env[...]` references behind the API.
 */

import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url({ message: 'NEXT_PUBLIC_API_URL must be a fully-qualified URL' }),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'],
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid client env (apps/console):\n${issues}`);
}

export const env = parsed.data;
