# ADR-0014: apps/api runtime architecture (env loading, bundling, Prisma surfacing)

## Status

Accepted

## Date

2026-05-17

## Context

Commit number-five stands up `apps/api` end to end for the first time: Hono
on Node 22, validated env, structured logging, the four-layer DDD shape, a
working `/v1/health` endpoint backed by a real Postgres probe, and a `tsup`
production bundle. While wiring these pieces together we had to make three
specific runtime decisions whose rationale would be invisible from the code
alone and which future contributors would otherwise be tempted to "fix":

1. **Env loading strategy.** `packages/db/src/env.ts` uses a lazily-memoised
   `getDbEnv()` because `prisma generate` and `prisma format` import the
   package without `DATABASE_URL` set. The API has no equivalent
   tooling-only import path; if env is broken the only correct response is
   to refuse to start. The two packages therefore use opposite strategies
   on purpose, and `apps/api/src/shared/env.ts` is the source of truth for
   how future apps/services should behave.

2. **Bundling Prisma vs workspace packages.** The `@opentrade/db` package
   exposes its TypeScript source directly (`"main": "./src/index.ts"`) and
   that source uses ESM-correct `.js` import specifiers (`./client.js`)
   that resolve under `tsx` and `esbuild` but fail under plain Node.
   Externalising workspace packages from the `tsup` bundle therefore
   produces an artefact that runs in dev mode but crashes the moment
   `node dist/main.js` starts. Meanwhile bundling `@prisma/client` itself
   breaks the generated engine's binary-path detection. We need an
   asymmetric rule.

3. **Where `@prisma/client` lives in `apps/api/package.json`.** Rule 31
   designates `@opentrade/db` as the single facade for the database client.
   At the **source** level we are fully compliant — every file in
   `apps/api/src/` that needs Prisma imports through `@opentrade/db`. But
   once `tsup` inlines the workspace facade, the bundled artefact contains
   a literal `import '@prisma/client'`. With pnpm's strict node_modules
   layout, that package is only visible inside `packages/db/node_modules`,
   not `apps/api/node_modules`, so `node dist/main.js` fails to resolve it.
   We have to either re-architect bundling, prebuild `@opentrade/db` to
   `.js`, or declare `@prisma/client` as a direct dependency of `apps/api`.

Without recording these decisions, a well-meaning future agent will see
"the dist/ artefact imports `@prisma/client` even though `@opentrade/db` is
the facade" and "try to clean it up", silently breaking the build.

## Decision

We adopt the following three rules for `apps/api` and any future Node
service in this repo.

### 1. apps/api env validation fails fast on import

`apps/api/src/shared/env.ts` parses `process.env` with zod at module
top-level and throws synchronously on failure. There is intentionally no
`getEnv()` accessor. The error message lists every offending key path so
misconfigured ECS task definitions surface in CloudWatch within seconds of
the container starting.

Long-form rationale lives in the module docblock. Other services may use
the lazy pattern only if they have a tooling-import path comparable to
Prisma's CLI.

### 2. tsup bundles workspace deps, externalises Prisma + dev-only deps

`apps/api/tsup.config.ts` is the authoritative shape:

```ts
external: ['@prisma/client', '.prisma/client', 'pino-pretty'],
noExternal: [/^@opentrade\//],
```

- All `@opentrade/*` workspace packages are inlined.
- `@prisma/client` and its generated `.prisma/client` directory stay
  external because the engine binaries are loaded by absolute path at
  runtime.
- `pino-pretty` is dev-only and must not ship to production at all.

The Dockerfile (planned in Commit number-nine) will copy the
pnpm-resolved Prisma client + engines alongside `dist/main.js`. This
keeps the deployed image small (~15 kB JS bundle + Prisma client) without
fighting pnpm's symlink topology at container build time.

### 3. apps/api declares `@prisma/client` as a direct dependency

`apps/api/package.json` lists `@prisma/client` in `dependencies`, pinned
to the same caret range as `packages/db`. This does NOT violate rule 31:
the facade rule applies at the **source level** (no `apps/api/src/**` file
may import from `@prisma/client`; they go through `@opentrade/db`). The
direct dependency exists purely so pnpm's strict layout makes
`@prisma/client` resolvable from the bundled output at runtime.

If we ever break this discipline at the source level, the typecheck
project boundary tests added in Commit number-ten CI will catch it. Until
then, this is enforced by code review.

## Alternatives Considered

### Alternative A: Build packages/db to dist/\*.js before consuming it

- **Pros**: Standard library setup; `@opentrade/db` becomes a normal
  compiled package; no `.js`-specifier-versus-Node mismatch.
- **Cons**:
  - Adds a real build step that turbo must order before `apps/api:build`.
  - Means `apps/api dev` (tsx watch) needs `pnpm db:build --watch` running
    in parallel, or it sees stale type info on schema changes.
  - Requires changing `packages/db/package.json`'s `main`, `types`,
    `exports`, plus a `tsup` or `tsc` build script and a build cache key
    for turbo.
  - Doubles the moving parts for marginal benefit at MVP scale.
- **Conclusion**: Defer until we have multiple consumers of `@opentrade/db`
  or until cold-start time becomes a real concern.

### Alternative B: Lazy memoise env in apps/api too

- **Pros**: Uniform pattern across all `*/env.ts` files.
- **Cons**:
  - Hides config errors until the first request, not the first import.
  - Pollutes logs with one error per request instead of crashing once.
  - The reason `packages/db` is lazy (Prisma CLI imports without
    `DATABASE_URL`) does not apply to apps; making them lazy by analogy is
    cargo-culting.
- **Conclusion**: Not selected.

### Alternative C: Externalise everything from the tsup bundle

- **Pros**: Smallest possible bundle; trivial to reason about.
- **Cons**:
  - Workspace packages' source uses `.js` specifiers that Node cannot
    resolve from `.ts` files → runtime crash on first import.
  - Would force option A as a prerequisite anyway.
- **Conclusion**: Not selected.

### Alternative D: Skip the production bundle entirely; ship src/ + tsx

- **Pros**: No tsup config; what runs in prod is what runs in dev.
- **Cons**:
  - `tsx` is a development tool; running it in production is unsupported
    and incurs interpreter overhead on every request.
  - Production container ends up with a `devDependencies` install (huge).
  - No tree-shaking, no minification, no source maps for production traces.
- **Conclusion**: Not selected.

## Consequences

### Positive

- `apps/api` starts up in deterministic order: env → logger → Hono →
  routes. A misconfigured deploy is detected at container boot, not at
  request time.
- `pnpm --filter @opentrade/api dev` and `pnpm --filter @opentrade/api
start` both run a server backed by the same Postgres, same env schema,
  same shutdown hooks. The dev / prod gap is small and well-understood.
- The production bundle stays under 20 kB of JS, so cold-start latency on
  ECS Fargate is dominated by Postgres connection setup rather than
  bundler output.
- Future services in the monorepo have a documented pattern to copy.

### Negative / Trade-offs

- `apps/api/package.json` lists `@prisma/client` directly even though we
  conceptually source-import through `@opentrade/db`. New contributors
  will need this ADR to understand why.
- Bundling workspace packages means a change in `packages/db/src/*` forces
  a full re-bundle of `apps/api` rather than relying on shared cache.
  Acceptable at MVP scale; revisit if cold builds become slow.
- The "build packages/db to dist/\*.js" path remains untravelled. When we
  do walk it (likely Phase 2 when an external consumer ships
  `@opentrade/db`), we will need a successor ADR.

### Neutral

- `pino-pretty` stays a devDependency only. Production logs are pure JSON,
  which is what CloudWatch / Datadog want anyway.

## Implementation Notes

- The env module is `apps/api/src/shared/env.ts`.
- The tsup config is `apps/api/tsup.config.ts`.
- The Prisma facade re-exports live in `packages/db/src/index.ts`.
- Health endpoint composition root that demonstrates the runtime client
  resolution: `apps/api/src/domains/health/presentation/routes.ts`.
- When Commit number-nine adds the Dockerfile, the multi-stage build must
  copy `node_modules/.pnpm/@prisma+client@*` and the generated
  `.prisma/client` directory next to `dist/main.js`. A reference snippet
  will live in `apps/api/Dockerfile` once it exists.

## References

- ADR-0006 (DDD + Modular Monolith; defines the facade rule context)
- ADR-0012 (local docker-compose Postgres)
- ADR-0013 (pin Prisma 6.x)
- `.cursor/rules/30-api-hono.mdc`
- `.cursor/rules/31-database-prisma.mdc`
- `.cursor/rules/50-security.mdc`
- [tsup config docs](https://tsup.egoist.dev/#bundle-options)
- [Prisma 6 binary engine layout](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections#postgresql)
