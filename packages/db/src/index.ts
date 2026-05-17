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

// Re-export enum runtime values + the Prisma namespace types for consumers.
// Frontend code MUST consume these via `import type` (verified by
// tsconfig.base.json's `verbatimModuleSyntax: true`).
export { LicenseStatus, LicenseType, Regulator, SbtTier, UserRole } from '@prisma/client';

export type { Broker, BrokerLicense, OutboxEvent, Prisma, Tenant, User } from '@prisma/client';
