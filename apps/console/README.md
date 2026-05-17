# `@opentrade/console`

> B2B back office for brokers, KOLs, and platform admins.

## Audience

- **Brokers** — claim profile, respond to disputes, view review analytics
- **KOLs / Financial Pundits** — bind on-chain identity, publish signals, view performance dashboards
- **Admins** — operate the platform (no power to alter user content; per cursor rule 50)

## Tech (planned)

Same stack as `apps/web`, but:

- Desktop-first (data-dense dashboards, tables, charts)
- KYC-gated entry (no public browsing)
- `robots.txt` disallows everything (no SEO)
- RBAC: broker / KOL / admin / super-admin

## Domain

- prod: `console.opentrade.io`
- staging: `console.staging.opentrade.io`
- dev: `console.dev.opentrade.io`

## Status

Phase 0 stub. Next.js initialisation lands in Phase 0 commit #3.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.1 and [ADR-0010](../../docs/decisions/0010-split-web-and-console.md).
