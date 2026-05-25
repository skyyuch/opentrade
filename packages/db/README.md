# `@opentrade/db`

> PostgreSQL schema and Prisma client for OpenTrade.

This package owns OpenTrade's relational schema, the migration history that
took the database to its current shape, and the singleton PrismaClient that
the API consumes at runtime. Authoritative rules live in
[`.cursor/rules/31-database-prisma.mdc`](../../.cursor/rules/31-database-prisma.mdc).

---

## Strict access rules

Per cursor rule 31 and ADR-0006:

- ✅ `apps/api` is the **only** runtime consumer of `prisma` / `prismaReadOnly`
- ✅ Other packages may `import type { Tenant } from '@opentrade/db'` (type-only)
- ❌ `apps/web`, `apps/console` MUST NOT import the runtime client (frontend
  never touches the database)

`tsconfig.base.json` enforces `verbatimModuleSyntax: true`, so the TypeScript
compiler flags a non-type runtime import from a forbidden package.

---

## Tech stack (per ADR-0002, ADR-0006, ADR-0012, ADR-0013)

- **Engine**: PostgreSQL 16 (RDS in prod, docker-compose locally)
- **ORM**: Prisma 6.19.x — deliberately pinned to 6.x (see ADR-0013)
- **Validation**: zod for env (`src/env.ts`)
- **Migrations**: Prisma Migrate, applied via GitHub Action in prod (added Commit #10)

---

## Schema at a glance (Phase 0)

```
Tenant ──┬── User
         ├── Broker ── BrokerLicense
         └── BrokerLicense
```

| Model           | Purpose                                       | Soft delete |
| --------------- | --------------------------------------------- | ----------- |
| `Tenant`        | Logical jurisdiction (V1 only `code = "hk"`)  | n/a         |
| `User`          | Privy-authenticated account; AA wallet linked | ✅          |
| `Broker`        | SFC-licensed broker; can be unclaimed         | ✅          |
| `BrokerLicense` | Per-license record with lifecycle status      | ✅          |

Enums: `UserRole`, `SbtTier`, `Regulator`, `LicenseType`, `LicenseStatus`.

Per-domain models (Review, KolSignal, Dispute, OutboxEvent, ...) land in
later commits alongside the API domains that own them.

---

## Multi-tenant ready (per rule 31)

Every user-scoped model has `tenantId` from day one. Phase 1 has a single
tenant (`hk`), but adding `tw` / `sg` / `jp` later is a `Tenant` insert
plus seed data — no schema changes required. All composite indexes are
prefixed with `tenantId` for efficient tenant-scoped queries.

---

## Local development

### Prerequisites

- Docker Desktop running (so the docker-compose Postgres is available)
- Root `.env` exists — `cp .env.example .env` if not

### First-time setup

```bash
docker compose up -d postgres                 # from repo root
pnpm install                                  # postinstall runs prisma generate
pnpm --filter @opentrade/db db:migrate:dev    # apply any pending migrations
```

### Daily workflow

| Command                                         | Purpose                                                       |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter @opentrade/db db:format`         | Run `prisma format` (also runs on save via editor extensions) |
| `pnpm --filter @opentrade/db db:generate`       | Regenerate the typed PrismaClient after schema edits          |
| `pnpm --filter @opentrade/db db:migrate:dev`    | Create + apply a new migration (prompts for name)             |
| `pnpm --filter @opentrade/db db:migrate:status` | Show which migrations are pending against local DB            |
| `pnpm --filter @opentrade/db db:migrate:deploy` | Apply pending migrations without prompts (used in CI / prod)  |
| `pnpm --filter @opentrade/db db:migrate:reset`  | DESTRUCTIVE — drop + recreate the local DB                    |
| `pnpm --filter @opentrade/db db:studio`         | Launch Prisma Studio at http://localhost:5555                 |

All `db:*` scripts use `dotenv-cli -e ../../.env` so they always read the
monorepo root `.env`.

### Migration naming

Migrations are named `<timestamp>_<verb>_<noun>` per rule 31, e.g.
`20260517100533_init_tenant_user_broker_license`. Use snake_case verbs in
the imperative mood (`add_review_table`, `drop_legacy_kol_column`).

### Never hand-edit a migration

Per rule 31, the SQL inside `prisma/migrations/` is **not** to be edited by
hand. If Prisma's generated SQL is wrong, fix the `schema.prisma`, regenerate,
review the diff, and either:

1. Accept the new migration (preferred), or
2. Reset and regenerate the previous migration (only if no one else has
   applied it yet — write an ADR if this happens).

---

## Production deployment

- `DATABASE_URL` is injected from AWS Secrets Manager at container start
- `db:migrate:deploy` is run by a dedicated GitHub Action (Commit #10) before
  any new `apps/api` container becomes healthy
- `_prisma_migrations` table tracks which migrations are applied; rerunning
  the deploy step is idempotent

### Pre-deploy backfill (per ADR-0026 + ADR-0027)

Two one-shot data migrations need to run on every fresh environment
before traffic flows to it:

| Script                      | Purpose                                                    | ADR      |
| --------------------------- | ---------------------------------------------------------- | -------- |
| `db:backfill:zh-hans`       | Populates `Broker.displayNameZhHans` via OpenCC `t → cn`   | ADR-0026 |
| `db:backfill:source-locale` | Classifies legacy `Review.sourceLocale = null` rows        | ADR-0027 |
| `db:backfill:prod`          | Convenience: runs both above in order, fail-fast on errors | both     |

Both scripts are **idempotent** (only touch rows where the target
column is `NULL`) and use cursor pagination so they are safe to re-run
without coordination.

Both also accept `--dry-run` to walk every candidate row and run the
classifier without touching the DB — recommended on first contact with
a fresh `DATABASE_URL`:

```bash
# preview both backfills against the target environment
pnpm --filter @opentrade/db db:backfill:zh-hans -- --dry-run
pnpm --filter @opentrade/db db:backfill:source-locale -- --dry-run

# then run for real
pnpm --filter @opentrade/db db:backfill:prod
```

The Phase 1 production deploy runbook (in
[`apps/api/README.md`](../../apps/api/README.md#production-deployment-runbook)
and [`infra/terraform/README.md`](../../infra/terraform/README.md#deploy-checklist))
pins these as required steps after `db:migrate:deploy` and before the
new `apps/api` container becomes healthy.

---

## Soft delete discipline

We never hard-delete user-scoped rows. Reasons:

1. Compliance / dispute trail — investors must be able to see who was struck
   off, not have it disappear
2. Tenant data segregation across regulators
3. Easier rollback when migrations go sideways

Set `deletedAt = now()` and let a Prisma extension (added Commit #5+) filter
those rows out of normal queries automatically.

Hard-delete exceptions:

- `outbox_events` after successful publish (added in Commit #5)
- GDPR / PDPO right-to-be-forgotten requests (manual, logged in audit trail)

---

## References

- [`.cursor/rules/31-database-prisma.mdc`](../../.cursor/rules/31-database-prisma.mdc) — full schema conventions
- [ADR-0002](../../docs/decisions/0002-aws-stack.md) — RDS Postgres 16 in prod
- [ADR-0006](../../docs/decisions/0006-ddd-modular-monolith.md) — only `apps/api` consumes the runtime client
- [ADR-0012](../../docs/decisions/0012-local-dev-docker-postgres.md) — local docker-compose Postgres
- [ADR-0013](../../docs/decisions/0013-pin-prisma-6-not-7.md) — pinned to Prisma 6.x
- [`docs/01-architecture.md` §4.4](../../docs/01-architecture.md) — storage architecture
