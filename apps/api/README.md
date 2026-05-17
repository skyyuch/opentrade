# `@opentrade/api`

> OpenTrade backend API. Hono on Node.js (ECS Fargate).

## Architecture

Per [ADR-0006](../../docs/decisions/0006-ddd-modular-monolith.md), this app is a **Modular Monolith** with **Domain-Driven Design**. Each business domain has its own folder with four layers:

```
src/
├── domains/
│   ├── reviews/
│   │   ├── domain/          # Entity, VO, Domain Event, Repository interface
│   │   ├── application/     # Use cases (Commands + Queries)
│   │   ├── infrastructure/  # Prisma repo, Chain client, IPFS client
│   │   └── presentation/    # Hono routes + DTO + Mapper
│   ├── brokers/
│   ├── kols/
│   ├── disputes/
│   ├── identity/
│   └── signals/
├── shared/
│   ├── events/              # Event bus + Outbox Pattern
│   ├── feature-flags/
│   ├── tenant/              # Multi-tenant context
│   ├── i18n/                # error_code → message
│   ├── auth/                # JWT middleware (Privy verification)
│   ├── observability/       # Pino logger + metrics
│   ├── chain/               # Multi-chain config abstraction
│   └── errors/              # AppError, ErrorCode enum
├── http/
│   ├── server.ts            # Hono entrypoint
│   ├── middleware/
│   ├── openapi.ts           # OpenAPI 3 spec autogen
│   └── routes.ts
└── main.ts
```

## Domain rules (per cursor rule 30)

- ❌ Domain A's application/infrastructure layer MUST NOT import Domain B internals
- ✅ Cross-domain communication via Domain Events (Outbox Pattern)
- ✅ All endpoints versioned `/v1/...` from day one
- ✅ All input validated via Zod
- ✅ All output mapped from Domain Entity → DTO before returning

## Domain

- prod: `api.opentrade.io`
- staging: `api.staging.opentrade.io`
- dev: `api.dev.opentrade.io`

## Status

Phase 0 stub. Hono initialisation + first domain (`reviews`) lands in Phase 1.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.3 for the full architecture.
