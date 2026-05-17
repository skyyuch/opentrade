/**
 * PrismaClient singletons for OpenTrade.
 *
 * `prisma`         — primary read/write client; uses DATABASE_URL via schema.prisma.
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

import { PrismaClient } from '@prisma/client';

import { getDbEnv } from './env.js';

import type { Prisma } from '@prisma/client';

type PrismaGlobal = {
  prisma?: PrismaClient;
  prismaReadOnly?: PrismaClient;
};

const globalForPrisma = globalThis as unknown as PrismaGlobal;

const createPrimaryClient = (): PrismaClient => {
  // Keep prod logs lean (warn/error only); dev intentionally matches prod so
  // we surface the same surface area locally. Query logging is opt-in via env.
  const log: Prisma.LogLevel[] = ['warn', 'error'];
  return new PrismaClient({ log });
};

const createReadOnlyClient = (): PrismaClient => {
  const env = getDbEnv();
  const url = env.DATABASE_READ_URL ?? env.DATABASE_URL;
  return new PrismaClient({
    datasources: { db: { url } },
    log: ['error'],
  });
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrimaryClient();
export const prismaReadOnly: PrismaClient =
  globalForPrisma.prismaReadOnly ?? createReadOnlyClient();

if (getDbEnv().NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaReadOnly = prismaReadOnly;
}
