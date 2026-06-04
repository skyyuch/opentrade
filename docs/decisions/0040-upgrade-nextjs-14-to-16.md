# ADR-0040: Upgrade Next.js 14 → 16 as a dedicated migration milestone

## Status

Accepted

## Date

2026-06-04

## Context

Both Next.js apps (`apps/web`, `apps/console`) are pinned to `next@~14.2.35`
with `react@^18.3.1`. Next.js 16 is now stable (latest `16.2.x`) and Next.js 14
is moving toward end-of-active-development.

During a dependency-hygiene review the project owner decided to move off 14.
The candidate paths were: a smaller 14 → 15 intermediate hop, or a direct
14 → 16 jump. The owner chose **direct 14 → 16**, executed as its own dedicated
agent session rather than mixed into feature work.

The jump is **not** a version bump — it crosses several compatibility
boundaries at once:

- **Async request APIs** (15+): `params`, `searchParams`, `cookies()`,
  `headers()`, `draftMode()` now return Promises. Every dynamic route, layout,
  `generateMetadata`, and helper that threads these values must `await` them.
  OpenTrade has many `[locale]` / `[slug]` / `[id]` segments, so this touches
  most of the App Router tree.
- **`middleware.ts` → `proxy.ts`** rename. We run a next-intl middleware that
  must be renamed and its exported function updated.
- **React 18 → 19** (+ React Compiler now stable in 16). Stricter HTML nesting
  / hydration enforcement surfaces previously-silent markup bugs.
- **Turbopack is the default** bundler for `dev` and `build`.
- **Caching model change**: implicit `fetch` caching → explicit `"use cache"` /
  Cache Components; `revalidateTag` semantics change, `updateTag()` added.
- **`next lint` removed** — must call ESLint (or Biome) directly; affects our
  scripts, Husky hooks, and CI.
- **Runtime floor raised**: Node.js 20.9+ minimum, TypeScript 5.1.0+.
- `next/image` defaults tightened (`minimumCacheTTL`, local IP restriction,
  `localPatterns` for query-string srcs).

## Decision

Upgrade `apps/web` and `apps/console` from `next@~14.2.35` to `next@^16.x`
(with `react@^19` / `react-dom@^19`), executed as a **single dedicated
migration milestone in its own agent session**, not interleaved with feature
work or the in-flight contract deployment.

This ADR records the decision and the migration plan. **No code changes land
with this ADR** — the pinned versions stay at 14.2.x / React 18 until the
migration session runs. The migration session owns the actual upgrade and the
follow-up doc/rule updates.

### Migration plan (for the handoff session)

1. Bump runtime floors: confirm Node 20.9+ and TypeScript 5.1+ in CI + local.
2. Run the official codemod per app:
   `npx @next/codemod@canary upgrade latest` (handles dep bumps, config
   transforms, most async-API rewrites).
3. Manually finish what the codemod misses — async `params`/`searchParams` in
   helper functions, custom hooks, and props drilled deep into components;
   update their types to `Promise<...>`.
4. Rename `middleware.ts` → `proxy.ts` in both apps; rename the exported
   function; re-verify next-intl locale routing.
5. Replace `next lint` usages in package scripts, Husky pre-commit/pre-push,
   and CI with direct ESLint (Flat Config).
6. Audit caching: decide per data path whether to opt into `"use cache"` /
   Cache Components; migrate `revalidateTag` → `updateTag()` where
   read-your-writes consistency is needed.
7. Sweep every major screen for React 19 hydration / invalid-nesting errors;
   fix by error class, not page by page.
8. Validate: `pnpm lint` + `pnpm typecheck` + `pnpm build` + full screen sweep
   on both apps.

### Done-conditions

- Both apps build and run on Next 16 + React 19 with Turbopack.
- No hydration / invalid-nesting errors on main flows (home, broker list,
  broker detail, KOL profile, signals/new, notes/new, console dashboards).
- CI green (lint, typecheck, build, e2e main flow).
- `AGENTS.md` tech table, rule 21 (react-nextjs), and any Next-14-specific docs
  updated to reflect 16. `docs/03-status.md` updated.

## Alternatives Considered

### Alternative A: 14 → 15 intermediate hop first

- **Pros**: Smaller blast radius; absorbs only the async-request-API break
  before tackling 16's caching + Turbopack defaults.
- **Cons**: Two migrations instead of one; the async-API rewrite (the bulk of
  the manual work) is identical in both, so splitting mostly duplicates QA.
- **Conclusion**: Not selected — owner chose a single direct jump.

### Alternative B: Stay on 14.2.x for the foreseeable future

- **Pros**: Zero churn; AGENTS.md already pins 14.
- **Cons**: Forgoes React 19 + React Compiler auto-memoisation, Turbopack build
  speed, and the explicit caching model; defers an upgrade that only grows
  harder over time.
- **Conclusion**: Not selected — owner decided to move off 14 now (planned),
  but as a dedicated milestone, not immediately inline.

### Alternative C: Direct 14 → 16 inline with current feature work

- **Cons**: A migration that touches most of the App Router tree mixed into
  feature branches would blow past the 300-line commit limit, entangle reviews,
  and collide with the in-flight contract deployment session.
- **Conclusion**: Not selected — must be its own session (chosen approach is
  "direct, but dedicated").

## Consequences

### Positive

- React 19 + stable React Compiler (auto-memoisation, fewer manual `useMemo`).
- Turbopack default → faster dev refresh and production builds.
- Explicit, predictable caching model instead of implicit `fetch` caching.
- Lands on an actively-developed major instead of a fading one.

### Negative / Trade-offs

- Large one-time migration: async-API rewrites across most routes + a full
  hydration sweep.
- React 19 strictness will surface latent markup bugs that must be fixed.
- Tooling/script churn (`next lint` removal, middleware rename) ripples into
  Husky + CI.
- AI training coverage for 16 is thinner than for 14; expect more manual
  verification.

### Neutral

- Component-level data-fetching call sites (`prisma.*`, fetch wrappers) are
  largely unaffected; the break is at the framework request-API boundary.

## Implementation Notes

- This is a **planning ADR**: code stays on 14.2.x / React 18 until the
  dedicated session runs.
- Coordinate ordering with the Prisma 7 migration (ADR-0041) and the contract
  deployment session so the three large changes do not overlap on `main`.
- The migration session MUST, on completion, update `AGENTS.md` (tech table),
  rule 21, and `docs/03-status.md` (rule 97 + rule 99).

## References

- [Next.js — Upgrading: Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [vercel/next.js v16 upgrade guide](https://github.com/vercel/next.js/blob/v16.2.1/docs/01-app/02-guides/upgrading/version-16.mdx)
- ADR-0010 (web/console split into two Next.js apps)
- ADR-0041 (Prisma 7 adoption — coordinate ordering)
- `.cursor/rules/21-react-nextjs.mdc`
- `AGENTS.md` tech stack table
