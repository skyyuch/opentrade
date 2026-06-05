/**
 * @opentrade/db — public entry point.
 *
 * Per cursor rule 31 and ADR-0006:
 *   - `apps/api` is the only package allowed to import the runtime exports
 *     (`prisma`, `prismaReadOnly`).
 *   - All other packages (`apps/web`, `apps/console`, `packages/shared`, ...)
 *     MUST use `import type` to consume model types only — never the runtime
 *     client. The frontend must never touch the database.
 *
 * If you need to expose new runtime helpers (e.g. a Prisma extension for
 * tenant-filter injection), add them here and document the consumer in the
 * README.
 *
 * See docs/01-architecture.md §4.4 for storage architecture.
 */

export const PACKAGE_NAME = '@opentrade/db' as const;

export { prisma, prismaReadOnly } from './client.js';
export { getDbEnv, type DbEnv } from './env.js';

// Re-export enum runtime values + the `Prisma` namespace (Prisma.JsonNull,
// Prisma.Decimal, Prisma.sql, ...) from the Prisma 7 generated client (ADR-0041).
// The generated path lives inside this package, so consumers never import it
// directly — `@opentrade/db` is the single database access entry point (rule 31).
// Frontend code (apps/web|console) MUST still consume these via `import type`;
// the architecture (rule 10) forbids importing the runtime client there, and
// tsconfig.base.json's `verbatimModuleSyntax: true` enforces it.
export {
  AssetClass,
  BrokerCategory,
  KolStatus,
  LicenseStatus,
  LicenseType,
  NotificationType,
  Prisma,
  PriceSource,
  Regulator,
  ReviewKind,
  ReviewStatus,
  SbtTier,
  Sentiment,
  SignalDirection,
  SignalOutcome,
  UserRole,
} from './generated/prisma/client.js';

export type {
  Broker,
  BrokerLicense,
  Instrument,
  Kol,
  KolFollow,
  KolNote,
  Notification,
  OutboxEvent,
  PriceRecord,
  PrismaClient,
  Review,
  Signal,
  Tenant,
  User,
} from './generated/prisma/client.js';
