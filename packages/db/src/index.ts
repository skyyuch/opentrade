/**
 * @opentrade/db
 *
 * Prisma schema, migrations, and the single PrismaClient instance for the
 * monorepo. Per cursor rule 31, ONLY `apps/api` may import the runtime client
 * from this package. Other packages may `import type` only.
 *
 * See docs/01-architecture.md §4.4 for storage architecture.
 */

export const PACKAGE_NAME = '@opentrade/db' as const;
