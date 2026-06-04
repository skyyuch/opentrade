/**
 * Prisma CLI configuration (Prisma 7+).
 *
 * Per ADR-0041, Prisma 7 no longer auto-loads env vars and moves connection
 * URLs out of `schema.prisma`'s datasource block. This file is the single place
 * the Prisma CLI (`generate`, `migrate`, `db execute`, `studio`) reads:
 *   - the schema location,
 *   - the migrations dir + explicit seed command (auto-seed was removed in 7),
 *   - the database connection URL (used for migrate/introspect — the runtime
 *     client uses the `@prisma/adapter-pg` driver adapter in src/client.ts).
 *
 * Env loading (rule 50): the OpenTrade `.env` lives at the monorepo root, not in
 * this package, so we load it explicitly here rather than relying on Prisma's
 * (removed) implicit loading or a local `.env`. Secrets are never committed.
 */

import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

/**
 * `prisma generate` / `prisma format` — and therefore the `postinstall` hook,
 * the Docker builder stage, and any fresh `pnpm install` without a `.env` —
 * must succeed without a live database (see the contract documented in
 * `src/env.ts`). Prisma 7's `env('DATABASE_URL')` helper resolves eagerly when
 * the config module loads and throws `PrismaConfigEnvError` if the var is
 * absent, which breaks all of those paths in CI.
 *
 * So we read the URL tolerantly: when it is missing we fall back to a
 * non-connecting placeholder good enough for schema-only commands. The CLI
 * commands that actually open a connection (`migrate`, `studio`, `db execute`)
 * are always invoked through the package scripts that load the root `.env`
 * first, so they receive the real URL; if it were somehow unset they would
 * fail loudly at connect time rather than silently using the placeholder.
 */
const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx scripts/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
