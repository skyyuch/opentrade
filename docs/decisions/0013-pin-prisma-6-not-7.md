# ADR-0013: Pin Prisma to 6.x — defer Prisma 7 adoption

## Status

Accepted

## Date

2026-05-17

## Context

Commit #4 introduces `@opentrade/db` with Prisma + PostgreSQL.

At the time of writing, two major Prisma versions are available on npm:

- **Prisma 6.19.3** — latest in the long-running 6.x line. Mature, widely used,
  extensive documentation, well covered by AI training data, classic
  `datasource db { url = env("DATABASE_URL") }` config in `schema.prisma`.
- **Prisma 7.8.0** — newly released major. Breaking architectural change:
  - `url` / `directUrl` / `shadowDatabaseUrl` removed from `schema.prisma`'s
    `datasource` block
  - Connection config moved to a new `prisma.config.ts` file
  - `PrismaClient` constructor now requires either a **driver adapter**
    (e.g. `@prisma/adapter-pg`) or an Accelerate URL
  - Different mental model for migrations, generation, and runtime client

Our initial attempt to scaffold on 7.8.0 failed at `prisma generate` with
`P1012` — the validator rejected the conventional `url = env("DATABASE_URL")`
syntax. Adapting to 7.x would require:

- Adding `prisma.config.ts` with a CLI-only loader
- Installing `@prisma/adapter-pg` + `pg` (or `pg-native`)
- Wrapping every `new PrismaClient()` call with the adapter
- Migration tooling that supports the new layout
- Higher cognitive load on every contributor

For an MVP in **Phase 0**, where:

1. AI agents do the bulk of the implementation work
2. Documentation breadth and AI training coverage materially affect velocity
3. We have not yet validated the schema against any production traffic
4. We need to ship Commits #5-#10 quickly to reach CCMF submission

… the marginal benefit of Prisma 7's driver-adapter model is not worth the
cost of bleeding-edge tooling instability and reduced AI assistance quality.

## Decision

Pin Prisma and `@prisma/client` to **`^6.19.3`** (caret allows 6.x patch
upgrades but not a jump to 7.x).

This applies to:

- `packages/db/package.json` → `prisma` (devDependencies), `@prisma/client`
  (dependencies)
- Any future package that consumes Prisma types

When Prisma 7 stabilises (criteria below) we will write a successor ADR and
plan a migration. Until then, **do not** upgrade to 7.x even if `pnpm up`
suggests it.

### Criteria to revisit (any one triggers a re-evaluation ADR)

- Prisma 7 reaches a `.5+` minor (i.e. ~12 months of bug-fix runway since 7.0)
- Prisma 7 documentation and migration guides are visibly comprehensive
- AI tools (Cursor, Claude) consistently produce idiomatic Prisma 7 code
- An external dependency we add (e.g. Prisma Accelerate, Pulse) requires 7.x

## Alternatives Considered

### Alternative A: Adopt Prisma 7.x now with driver adapter

- **Pros**: Future-proof; aligns with Prisma's stated direction
- **Cons**:
  - Doubles the boilerplate in `client.ts` (adapter + connection string + pool config)
  - `prisma.config.ts` adds a second config file that must stay in sync with `.env`
  - Many AI suggestions still target the 6.x API; constant drift
  - Tooling integrations (Prisma Studio, Migrate UI) had known glitches in 7.0-7.8
- **Conclusion**: Defer

### Alternative B: Use an entirely different ORM (Drizzle, Kysely, MikroORM)

- **Pros**: Avoids vendor risk entirely
- **Cons**:
  - Contradicts `AGENTS.md` tech stack table (`PostgreSQL + Prisma ORM`)
  - Loses Prisma's migration tooling, which is best-in-class for our workflow
  - Would need its own ADR superseding 0002 / architecture docs
- **Conclusion**: Not selected — Prisma chosen for good reasons; stick with it,
  just at a stable version

### Alternative C: Pin Prisma 5.x

- **Pros**: Even more battle-tested
- **Cons**:
  - One major version behind; missing the Prisma 6.x feature line
    (typed JSON, improved performance, better TypedSQL, new generator preview)
  - Will require sooner re-evaluation
- **Conclusion**: Not selected — 6.x is the right balance of stability vs modernity

### Alternative D (chosen): Pin Prisma 6.19.3

- Caret range `^6.19.3` lets us pick up patch releases automatically
- Plain `datasource db { url = env("DATABASE_URL") }` keeps `schema.prisma` as
  the single config source
- Wide AI training coverage
- Standard `prisma migrate dev` workflow without driver-adapter detours

## Consequences

### Positive

- Conventional Prisma usage; new contributors and AI agents on-board immediately
- Single schema file as source of truth (no extra `prisma.config.ts`)
- Best-known migration workflow
- Predictable patch upgrades via Renovate or `pnpm up --latest`

### Negative / Trade-offs

- We will eventually need to migrate to Prisma 7+ (paid technical debt with
  defined trigger conditions above)
- Some 7.x-only features (e.g. forthcoming Cloudflare D1 adapter for edge)
  are unavailable; not currently needed
- Caret range `^6.19.3` will NOT auto-bump to 7.x; intentional

### Neutral

- The `client.ts` singleton pattern, env validation via zod, and migration
  flow are identical across 6.x and 7.x at the conceptual level — porting
  later is a mechanical exercise

## Implementation Notes

### Lockfile discipline

- `pnpm-lock.yaml` will pin specific 6.19.x versions; Renovate / dependabot
  configs (added in Commit #10) MUST exclude Prisma major upgrades from
  auto-merge rules
- Any `pnpm up prisma` PR landing 7.x is rejected and reverted to the 6.x line

### Code that DOES NOT need to change when we eventually adopt 7.x

- `schema.prisma` model & enum definitions
- Generated client consumers in domain layers (the `prisma.user.findMany(...)`
  API is stable across 6→7)
- Migration SQL files (already pure SQL, version-agnostic)

### Code that WILL need to change

- `packages/db/src/client.ts` — switch to driver-adapter construction
- `packages/db/prisma/schema.prisma` — remove `url` line from datasource
- Add `packages/db/prisma.config.ts` with CLI loader
- `packages/db/package.json` — add `@prisma/adapter-pg`, `pg`

## References

- [Prisma 7 release notes](https://www.prisma.io/blog) (driver adapter required)
- [Prisma config docs](https://pris.ly/d/config-datasource)
- `.cursor/rules/31-database-prisma.mdc`
- ADR-0002 (Postgres on RDS)
- ADR-0006 (DDD + Modular Monolith)
- ADR-0012 (local docker-compose Postgres)
