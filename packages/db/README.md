# `@opentrade/db`

> PostgreSQL schema and Prisma client.

## Purpose

The single source of truth for OpenTrade's database schema, migrations, and runtime client.

## Strict access rules (per cursor rule 31)

- ✅ `apps/api` is the **only** runtime consumer of `PrismaClient`
- ✅ Other packages may `import type { Review } from '@opentrade/db'` (type-only) for shared shapes
- ❌ `apps/web`, `apps/console` MUST NOT import the runtime client (frontend never touches DB)

## Database backbone (per ADR-0002)

- **Engine**: PostgreSQL 16
- **Hosting**: AWS RDS Multi-AZ + Read Replica (per environment)
- **Connection**: from AWS Secrets Manager into Hono via env
- **Migrations**: Prisma Migrate, deployed via dedicated GitHub Action

## Multi-tenant ready (per cursor rule 31)

Every user-scoped model has a `tenantId` from day one. Phase 1 has a single tenant (`hk`), but the architecture supports adding `tw`, `sg`, etc. without schema changes.

## Status

Phase 0 stub — no schema yet. Schema lands in Commit #3-#5 alongside `apps/api`.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.4 for storage architecture.
