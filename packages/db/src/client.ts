/**
 * PrismaClient singletons for OpenTrade.
 *
 * `prisma`         — primary read/write client; built on the @prisma/adapter-pg
 *                    driver adapter from DATABASE_URL (Prisma 7, ADR-0041).
 * `prismaReadOnly` — read-only client; pointed at DATABASE_READ_URL when set,
 *                    otherwise falls back to DATABASE_URL so the code path is
 *                    still exercised in local dev.
 *
 * Why global caching:
 *   - Long-lived processes (apps/api on ECS) instantiate the client once and
 *     reuse it for the process lifetime.
 *   - Hot module reloading (Storybook, future Next.js dev server importing
 *     types only) can otherwise spawn duplicate clients and exhaust the
 *     Postgres connection pool.
 *
 * Per cursor rule 31, this module is the **only** place in the monorepo
 * where `new PrismaClient()` is allowed.
 */

import { PrismaPg } from '@prisma/adapter-pg';

import { getDbEnv } from './env.js';
import { PrismaClient } from './generated/prisma/client.js';

import type { Prisma } from './generated/prisma/client.js';

type PrismaGlobal = {
  prisma?: PrismaClient;
  prismaReadOnly?: PrismaClient;
};

const globalForPrisma = globalThis as unknown as PrismaGlobal;

/**
 * Prisma 7 driver adapters inherit the underlying `pg` pool settings, which
 * differ from Prisma 6 defaults. Notably `pg` has NO connection timeout by
 * default (`0`), whereas Prisma 6 used 5s. We restore 5s so an unreachable DB
 * fails fast instead of hanging (ADR-0041).
 */
const PG_CONNECTION_TIMEOUT_MS = 5_000;

const createAdapter = (url: string): PrismaPg =>
  new PrismaPg({ connectionString: url, connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS });

const createPrimaryClient = (): PrismaClient => {
  // Keep prod logs lean (warn/error only); dev intentionally matches prod so
  // we surface the same surface area locally. Query logging is opt-in via env.
  const log: Prisma.LogLevel[] = ['warn', 'error'];
  return new PrismaClient({ adapter: createAdapter(getDbEnv().DATABASE_URL), log });
};

const createReadOnlyClient = (): PrismaClient => {
  const env = getDbEnv();
  const url = env.DATABASE_READ_URL ?? env.DATABASE_URL;
  return new PrismaClient({ adapter: createAdapter(url), log: ['error'] });
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrimaryClient();
export const prismaReadOnly: PrismaClient =
  globalForPrisma.prismaReadOnly ?? createReadOnlyClient();

if (getDbEnv().NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaReadOnly = prismaReadOnly;
}
