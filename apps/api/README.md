# `@opentrade/api`

> OpenTrade backend API. Hono on Node.js, deployed to ECS Fargate.

## Architecture

Per [ADR-0006](../../docs/decisions/0006-ddd-modular-monolith.md), this app
is a **Modular Monolith** with **Domain-Driven Design**. Every business
domain owns four layers, in this strict order:

```
src/
├── main.ts                      # Process entrypoint (boot + signal handling)
├── http/                        # Cross-cutting HTTP plumbing
│   ├── server.ts                # Hono factory + middleware chain
│   ├── types.ts                 # AppHonoEnv (requestId, logger)
│   └── middleware/
│       ├── requestContext.ts    # requestId + Pino child logger
│       └── errorHandler.ts      # AppError / HTTPException / ZodError envelope
├── shared/                      # Cross-domain infrastructure
│   ├── env.ts                   # zod-validated env (fail-fast on import)
│   ├── errors/                  # AppError + ErrorCode (const-object, no TS enum)
│   └── observability/
│       └── logger.ts            # Pino root + child factory
└── domains/                     # One folder per business domain
    └── health/                  # Canonical reference shape
        ├── domain/              # Entities, VOs, ports (zero framework imports)
        ├── application/         # Use cases (depend on interfaces only)
        ├── infrastructure/      # Prisma / IPFS / chain adapters
        ├── presentation/        # Hono routes + DTO + mapper
        └── index.ts             # Only `<domain>Router` crosses the boundary
```

Subsequent commits add `reviews`, `brokers`, `kols`, `disputes`,
`identity`, `signals` — every one of them following the same four-layer
shape as `domains/health`.

### Domain rules (per cursor rule 30)

- ❌ Domain A's `application/` or `infrastructure/` MUST NOT import Domain B internals
- ✅ Cross-domain communication uses the **Outbox Pattern** (see `OutboxEvent` table)
- ✅ Every endpoint is versioned `/v1/...` from day one
- ✅ Every input is validated via Zod
- ✅ Every output is mapped from Domain Entity → DTO before returning
- ✅ Domain layer NEVER imports Prisma, Hono, viem, or anything framework-shaped

## Run it

### Prerequisites

- Node 22 (`nvm use`)
- pnpm 9.15+
- Docker (for the local Postgres — see [ADR-0012](../../docs/decisions/0012-local-dev-docker-postgres.md))
- Root `.env` populated (copy from `.env.example`)

### Local dev

```bash
# from repo root:
docker compose up -d postgres                    # start Postgres if not already running
pnpm --filter @opentrade/db db:migrate:dev       # apply any pending migrations
pnpm --filter @opentrade/db db:seed              # idempotent: ensures the hk Tenant exists
pnpm --filter @opentrade/api dev                 # tsx watch on http://localhost:4000

# in another terminal:
curl http://localhost:4000/v1/health             # → 200 OK with DB latency
```

### Production-style build

```bash
pnpm --filter @opentrade/api build               # tsup bundles to dist/main.js (~15 kB)
pnpm --filter @opentrade/api start               # node dist/main.js
```

The build externalises `@prisma/client` (native engine binaries) and
`pino-pretty` (dev-only transport); everything else, including workspace
packages, is inlined. See `tsup.config.ts` for details.

### Production container image

The Dockerfile is a multi-stage Debian-slim build. Build context is the
**monorepo root** (NOT `apps/api/`):

```bash
# from repo root:
docker build -f apps/api/Dockerfile -t opentrade-api:dev .
```

Stage breakdown (per [ADR-0014](../../docs/decisions/0014-api-runtime-architecture.md) +
[ADR-0017](../../docs/decisions/0017-terraform-iac-and-phase0-apply-scope.md)):

1. `base` — Node 22.13-slim + pinned pnpm 9.15.4 + OpenSSL.
2. `deps` — `pnpm install --frozen-lockfile` against all manifests +
   the Prisma schema. Layer cache breaks only on lockfile changes.
3. `builder` — `pnpm --filter @opentrade/api build` (tsup) →
   `pnpm --filter @opentrade/api --prod deploy --ignore-scripts /deploy` →
   manual copy of the prisma-generated `.prisma/` from pnpm's `.pnpm`
   content store into `/deploy/node_modules/.prisma/`.
4. `runtime` — fresh Debian-slim, non-root `opentrade` user, single
   COPY from `/deploy`, HEALTHCHECK on `/v1/health`.

Image size: ~554 MB uncompressed / ~125 MB compressed (ECR-stored).

Smoke-run locally:

```bash
docker run --rm -p 14000:4000 \
  -e DATABASE_URL='postgresql://opentrade:devpassword@host.docker.internal:5432/opentrade?schema=public' \
  -e JWT_SECRET='this-is-a-development-jwt-secret-of-32-bytes' \
  opentrade-api:dev

# in another terminal:
curl http://localhost:14000/v1/health
```

### Push to ECR (Phase-0 dev environment)

`infra/terraform/environments/dev` provisioned an ECR repository at
`371637912734.dkr.ecr.ap-southeast-1.amazonaws.com/opentrade-api`. To
push the locally-built image:

```bash
aws ecr get-login-password --profile opentrade-dev --region ap-southeast-1 \
  | docker login --username AWS --password-stdin 371637912734.dkr.ecr.ap-southeast-1.amazonaws.com

docker tag opentrade-api:dev \
  371637912734.dkr.ecr.ap-southeast-1.amazonaws.com/opentrade-api:dev

docker push 371637912734.dkr.ecr.ap-southeast-1.amazonaws.com/opentrade-api:dev
```

Phase 1 introduces release-tagged pushes (e.g. `:0.1.0`) via GitHub
Actions OIDC.

### Production deployment runbook

Phase 1 prod deploy must run these steps in order. Each is idempotent
on its own; the order matters so the new container observes the data
shape it was compiled against.

1. `pnpm --filter @opentrade/db db:migrate:deploy` — apply pending
   Prisma migrations. CI / GitHub Action runs this; manual runs only
   for break-glass.
2. (Optional, recommended first time) `db:backfill:zh-hans --dry-run`
   - `db:backfill:source-locale --dry-run` to preview the row counts
     per [`packages/db/README.md`](../../packages/db/README.md#pre-deploy-backfill-per-adr-0026--adr-0027).
3. `pnpm --filter @opentrade/db db:backfill:prod` — populate
   `Broker.displayNameZhHans` (per ADR-0026) and `Review.sourceLocale`
   (per ADR-0027 D8) on legacy rows. Skip-safely on re-runs.
4. Roll the new `apps/api` container — ECS Fargate updates the service
   with the new task definition; the `/v1/health` HEALTHCHECK gates
   traffic.

## Endpoints

| Method | Path         | Auth   | Purpose                                |
| ------ | ------------ | ------ | -------------------------------------- |
| GET    | `/v1/health` | public | Liveness + DB probe; 503 if DB is DOWN |

## Wire contracts

Response envelope (success): domain-specific, see each route's DTO.

Response envelope (error), per rule 30:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Default English message for developer logs",
    "details": { "...": "..." },
    "requestId": "f1c8…"
  }
}
```

The frontend uses `error.code` for i18n lookup; `error.message` is never
shown to end users.

## Environment variables

| Key            | Required | Default     | Notes                                    |
| -------------- | -------- | ----------- | ---------------------------------------- |
| `NODE_ENV`     | no       | development | `development` enables pino-pretty output |
| `SERVER_HOST`  | no       | `0.0.0.0`   | Bind address                             |
| `SERVER_PORT`  | no       | `4000`      | TCP port (1024-65535)                    |
| `CORS_ORIGIN`  | no       | (empty)     | Comma-separated whitelist                |
| `LOG_LEVEL`    | no       | `info`      | `fatal\|error\|warn\|info\|debug\|trace` |
| `JWT_SECRET`   | **yes**  | —           | Min 32 chars; ES256 in Phase 1+          |
| `DATABASE_URL` | **yes**  | —           | Consumed via `@opentrade/db`             |

All keys are validated by `src/shared/env.ts` at import time; missing or
invalid values crash the process before any port is bound, with the
offending field names in the error message.

## Domain

- prod: `api.opentrade.io`
- staging: `api.staging.opentrade.io`
- dev: `api.dev.opentrade.io`

## Status

Phase 0 (Commit number-nine). Health endpoint live; Dockerfile multi-stage
build smoke-tested + image pushed to ECR. ECS service definition lands in
Phase 1 alongside the first business domain.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.3 for the
full architecture.
