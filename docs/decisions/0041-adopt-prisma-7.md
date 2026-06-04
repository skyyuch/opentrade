# ADR-0041: Adopt Prisma 7 (supersedes ADR-0013)

## Status

Accepted

## Date

2026-06-04

## Context

[ADR-0013](./0013-pin-prisma-6-not-7.md) pinned Prisma to `^6.19.3` for Phase 0,
deferring Prisma 7 until trigger conditions were met (notably "Prisma 7 reaches
`.5+` minor / ~12 months of runway"). `packages/db` currently runs
`prisma@^6.19.3` and `@prisma/client@^6.19.3`.

Prisma 7.0 shipped 2025-11-19 (Rust-free client as the default). It is now
roughly 6 months old. The strict 12-month criterion in ADR-0013 has **not**
fully elapsed, but the project owner has chosen to **promote early** (ADR-0013
explicitly allows earlier promotion on owner declaration) and execute the
upgrade as a dedicated agent session, to clear the technical debt before more
of the schema and query surface accretes.

Prisma 7 is an architectural release, not a routine bump:

- **Rust query engine → WASM planner + driver adapters.** `PrismaClient` now
  requires an explicit driver adapter (`@prisma/adapter-pg` + `pg` for our
  self-hosted Postgres / RDS).
- **Generator output path change.** The `prisma-client` provider requires a
  custom `output` path (e.g. `@/generated/prisma/client`); the legacy
  `prisma-client-js` provider is deprecated. **Every `@prisma/client` import
  changes.**
- **`prisma.config.ts` required** for introspection/migrate; `url` /
  `directUrl` / `shadowDatabaseUrl` move out of `schema.prisma`'s `datasource`.
- **CLI no longer auto-loads env vars** — must load via `dotenv` explicitly.
  (We already pass `dotenv -e ../../.env --` in several scripts.)
- **Post-install auto-generate removed** — `prisma generate` must be explicit.
- **Auto-seed between `migrate` commands removed**; several CLI flags
  (`--skip-generate`, `--skip-seed`) deprecated.
- **Client middleware (`$use`) removed.**
- MongoDB unsupported on 7 (irrelevant — we are Postgres).

OpenTrade's blast radius: `packages/db/src/client.ts` (adapter construction),
the schema datasource block, a new `prisma.config.ts`, all import sites of the
generated client across `apps/api` domains, and the `packages/db` scripts (seed,
backfills, broker/instrument sync) that rely on implicit env loading and
auto-generate.

## Decision

Adopt **Prisma 7.x** in `packages/db` (Rust-free `prisma-client` provider +
`@prisma/adapter-pg`), executed as a **single dedicated migration milestone in
its own agent session**. This ADR **supersedes ADR-0013**.

This ADR records the decision and the migration plan. **No code changes land
with this ADR** — `packages/db` stays on `^6.19.3` until the migration session
runs.

### Migration plan (for the handoff session)

1. Bump `prisma` + `@prisma/client` to `^7.x`; add `@prisma/adapter-pg` + `pg`.
2. Switch the generator to the `prisma-client` provider with an explicit
   `output` path; regenerate.
3. Update every import of the generated client to the new output path
   (codemod-style sweep across `packages/db` + `apps/api`).
4. Rewrite `packages/db/src/client.ts` singleton to construct `PrismaClient`
   with `new PrismaPg(...)` adapter from `DATABASE_URL`.
5. Add `packages/db/prisma.config.ts`; remove `url`/`directUrl` from the
   `datasource` block; wire env loading via `dotenv` (do NOT commit secrets).
6. Fix CLI scripts: explicit `prisma generate`; replace any reliance on
   auto-seed during `migrate` with an explicit seed step; confirm all scripts
   load env.
7. Remove any `$use` client middleware (none expected; verify) and migrate to
   `$extends` if found.
8. Validate: `pnpm --filter @opentrade/db db:generate`, migrate dev against
   local Postgres, run the api test suite, smoke the outbox worker + sync jobs.

### Done-conditions

- `packages/db` builds + generates on Prisma 7; api boots and serves data.
- All seed / backfill / sync scripts run under the new CLI semantics.
- CI green (typecheck, unit, build).
- ADR-0013 marked Superseded; `AGENTS.md` tech table, rule 31
  (database-prisma), and `docs/03-status.md` updated.

## Alternatives Considered

### Alternative A: Stay on 6.x until the full 12-month criterion (ADR-0013)

- **Pros**: Maximum tooling maturity / AI coverage; zero churn now.
- **Cons**: Debt grows with every new model and query; the import-path break
  gets more expensive the longer we wait.
- **Conclusion**: Not selected — owner promoted early per ADR-0013's
  owner-declaration clause.

### Alternative B: Switch ORM entirely (Drizzle / Kysely)

- **Cons**: Contradicts AGENTS.md tech stack; discards Prisma's best-in-class
  migration tooling; needs its own superseding ADR.
- **Conclusion**: Not selected (same reasoning as ADR-0013 Alternative B).

### Alternative C: Adopt 7 inline with feature work

- **Cons**: The generated-client import-path change touches many files at once;
  must not be entangled with feature branches or the Next 16 / contract
  deployment sessions.
- **Conclusion**: Not selected — dedicated session (chosen).

## Consequences

### Positive

- Rust-free client: faster cold starts, smaller bundle, lower resource use,
  first-class edge targets if ever needed.
- `prisma.config.ts` + explicit env loading gives clearer per-environment
  control (aligns with rule 50 secrets discipline).
- Clears the deferred debt from ADR-0013 on the owner's schedule.

### Negative / Trade-offs

- Invasive one-time migration: import-path sweep + client construction rewrite
  - CLI script fixes.
- Thinner AI training coverage for 7's driver-adapter path; more manual
  verification, especially the self-hosted Postgres adapter wiring.
- A second config file (`prisma.config.ts`) to keep in sync with `.env`.

### Neutral

- `schema.prisma` model/enum definitions and migration SQL are version-agnostic
  and carry over unchanged; the query API (`prisma.x.findMany`) is stable 6→7.

## Implementation Notes

- This is a **planning ADR**: `packages/db` stays on `^6.19.3` until the
  dedicated session runs.
- Update the Dependabot/Renovate config: ADR-0013 told it to reject Prisma
  major bumps; once on 7, that guard should be retargeted to "stay within 7.x"
  rather than blocking 7 entirely.
- Coordinate ordering with ADR-0040 (Next 16) and the contract deployment
  session to avoid overlapping large changes on `main`.
- The migration session MUST update `AGENTS.md`, rule 31, and
  `docs/03-status.md` on completion (rule 97 + rule 99).

## References

- [Upgrade to Prisma ORM 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Prisma 7.0 changelog (Rust-free default)](https://www.prisma.io/changelog/2025-11-19)
- ADR-0013 (pin Prisma 6 — superseded by this ADR)
- ADR-0040 (Next 16 upgrade — coordinate ordering)
- `.cursor/rules/31-database-prisma.mdc`
- `AGENTS.md` tech stack table
