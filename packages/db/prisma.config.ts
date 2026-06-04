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
import { defineConfig, env } from 'prisma/config';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx scripts/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
