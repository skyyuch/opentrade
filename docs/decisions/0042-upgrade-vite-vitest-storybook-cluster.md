# ADR-0042: Upgrade the Vite 7 / Vitest 4 / Storybook 10 dev-tooling cluster; defer plugin-react 6 + React Compiler

## Status

Accepted

## Date

2026-06-05

## Context

After the Next 16 (ADR-0040) and Prisma 7 (ADR-0041) migrations landed on
`main`, five Dependabot PRs remained deferred as a "large-migration" cluster
(per `docs/03-status.md` summaries 47/52). Four of them are dev-tooling majors
that are tightly coupled, and one (tailwindcss 4) is an independent CSS-first
rewrite handled separately:

- `#8` `@vitejs/plugin-react` 4.7.0 → **6.0.2**
- `#23` `@vitest/coverage-v8` 3.2.4 → **4.1.8** (implies `vitest` 4)
- `#24` `@storybook/addon-themes` 8.6.18 → **10.4.2**
- `#28` `@storybook/react-vite` 8.6.18 → **10.4.2**
- `#15` `tailwindcss` 3.4.19 → 4.3.0 (independent — out of scope here)

These are **developer-only build/test/preview tools**. They are never bundled
into the user-facing apps and carry no user-visible behaviour, no deadline, and
no security emergency. The cost of leaving them is slow technical-debt accrual:
the longer we wait, the larger the eventual jump.

**Key finding that reshaped the scope.** The prior session estimated this as a
"Vite 6" jump. Verified against the registry on 2026-06-05, the reality is much
heavier:

- Vite `latest` is **8.0.16** (Vite 5 → 8 is a **three-major** jump).
- `@vitejs/plugin-react@6.x` (all of 6.0.0/6.0.1/6.0.2) peer-requires
  **`vite: ^8.0.0` only**, plus `@rolldown/plugin-babel` and
  **`babel-plugin-react-compiler ^1.0.0`** — i.e. plugin-react 6 is the
  Rolldown + **React Compiler**-era plugin. Adopting it is an architectural
  decision about React Compiler, not a routine dev-tool bump.
- `@vitejs/plugin-react@5.2.0` (already used by `apps/web`) peer-supports
  `vite ^4 || ^5 || ^6 || ^7 || ^8` — so plugin-react **5** already runs on
  Vite 8 with no React Compiler entanglement.
- `vitest@4.1.8` peer-supports `vite ^6 || ^7 || ^8`; requires Node ≥ 20
  (we run Node 22). Coverage now defaults to included files only — our configs
  already set explicit `coverage.include`.
- `@storybook/react-vite@10.4.2` peer-supports `vite ^5 || ^6 || ^7 || ^8`.
  Storybook 9/10 removed several now-empty addon packages
  (`@storybook/addon-essentials`, `@storybook/addon-interactions`,
  `@storybook/blocks`, `@storybook/test`); their features moved into the core
  `storybook` package, and docs now require a separate `@storybook/addon-docs`.

Blast radius: `packages/ui` (Vite, plugin-react, Storybook config + deps) and
the four Vitest workspaces (`apps/api`, `apps/web`, `packages/ui`,
`packages/shared`). No app runtime code ships these tools.

## Decision

Execute a **path-2 (pragmatic) cluster upgrade** in a single dedicated session:

1. **Vite 5 → 7** in `packages/ui` (the only workspace with an explicit `vite`
   devDep). Bump `packages/ui` `@vitejs/plugin-react` **4.3.4 → 5.2.0** (NOT 6).
   `apps/web` stays on plugin-react 5.2.0 (already Vite-7/8-compatible).

   **Vite 7, not 8** (implementation finding, 2026-06-05): Vite 8 ships the
   Rolldown bundler by default, and Storybook 10.4.2's `@storybook/builder-vite`
   plugins (`inject-export-order-plugin`, `external-globals-plugin`) fail to
   parse the story modules under Rolldown (`build-storybook` aborts with
   "Parse error"). Vitest 4 runs fine on Vite 8 because it bypasses those
   builder plugins, but the design-system's `build-storybook` is a hard
   done-condition. Vite 7.3.5 is the last esbuild/Rollup-based major and is
   fully supported by Vitest 4, Storybook 10, and plugin-react 5 — so path 2
   targets Vite 7 and revisits Vite 8 once Storybook's Rolldown support lands.
   (Vite 8 would only have been _required_ under path 1 / plugin-react 6, which
   we are not taking.)

2. **Vitest 3 → 4** (`vitest` + `@vitest/coverage-v8` → `^4.1.8`) across all
   four test workspaces, reconciling any breaking config options.
3. **Storybook 8 → 10** in `packages/ui`: remove the now-empty addon packages,
   add `@storybook/addon-docs`, bump remaining addons + framework to `^10.4.2`,
   and adjust `.storybook/main.ts` / `preview.tsx`.

This **closes Dependabot #23 / #24 / #28**.

**Explicitly defer `#8` (plugin-react 6).** We do NOT adopt plugin-react 6,
because it forces the React Compiler (`babel-plugin-react-compiler`) and the
Rolldown babel plugin. Adopting React Compiler is a separate architectural
decision (it changes how components are authored/optimised across `apps/web`
and `packages/ui`) and deserves its own ADR with its own risk assessment. Until
then, plugin-react stays on the 5.x line, which fully supports Vite 8.

**Code lands in this same session** (the project owner approved "do it now"),
unlike the planning-only ADR-0040/0041. Each step is an atomic commit that
passes lint + typecheck + the relevant test suite independently.

### Done-conditions

- `pnpm lint` (0 errors), `pnpm typecheck` (8 workspaces), `pnpm test:unit`
  (api / ui / web / shared) all green on the new stack.
- `pnpm --filter @opentrade/ui build-storybook` succeeds on Storybook 10.
- `apps/web` + `apps/console` production builds still pass (Next 16 untouched).
- Dependabot #23 / #24 / #28 closed; #8 left open/deferred with a pointer to a
  future React Compiler decision.
- `docs/03-status.md` updated; rule 99 self-review performed.

## Alternatives Considered

### Alternative A (path 1 — aggressive): take plugin-react 6 + React Compiler now

- **Pros**: closes all four cluster PRs in one pass; on the absolute latest
  tooling.
- **Cons**: drags React Compiler (a behaviour-affecting compiler) and the
  Rolldown babel plugin into the codebase as a side effect of a dev-tool bump;
  highest risk; conflates two unrelated decisions; React Compiler adoption
  should be a deliberate, separately-reasoned choice.
- **Conclusion**: Not selected — React Compiler is not a "bump", it is an
  architectural decision that must stand on its own ADR.

### Alternative B (path 3 — minimal): Vite 7 + Vitest 4 only

- **Pros**: smallest blast radius; closes #23.
- **Cons**: leaves Storybook two majors behind (debt persists); requires a
  second migration session soon anyway; Vite 7 vs 8 makes little difference to
  effort once we are doing a multi-major Vite jump.
- **Conclusion**: Not selected — does not meaningfully reduce risk versus
  path 2 while leaving more debt.

### Alternative C: do nothing (keep deferring the whole cluster)

- **Pros**: zero effort/risk now; no user impact (dev-only tools).
- **Cons**: debt compounds; future jump grows (Vite already moved 6→8 while we
  waited); four PRs linger as noise; weaker repo-hygiene narrative for grant /
  investor due diligence.
- **Conclusion**: Not selected — owner chose to clear the debt now.

## Consequences

### Positive

- Three of four cluster PRs cleared; tooling on current, maintained versions
  (security/bug fixes, faster builds/tests).
- React Compiler decision kept clean and separate, not smuggled in via a bump.
- Smaller, well-scoped migration now instead of a bigger forced jump later.

### Negative / Trade-offs

- A two-major Vite jump (5→7) plus a major Vitest jump (3→4) has real breaking
  surface in `packages/ui` and the four Vitest configs; needs careful per-step
  verification. (Vite 8 deferred pending Storybook Rolldown support.)
- Vitest 4's Module Runner no longer shares the `expect` instance with the
  externalised `@testing-library/jest-dom/vitest` auto-extend entry, and 4.1.6+
  stopped merging external `Assertion` augmentation. Setup files must register
  matchers manually (`expect.extend`) and augment the `Matchers` interface.
- `#8` stays open until React Compiler is decided — one lingering Dependabot PR.
- Thinner AI/training coverage for the newest Vite 8 / Storybook 10 specifics;
  more manual verification.

### Neutral

- No user-facing change whatsoever; app runtime bundles are unaffected.
- `tailwindcss` 4 (#15) remains an independent future migration.

## Implementation Notes

- Order matters: bump Vite (+ ui plugin-react 5) first (foundation for both
  Vitest 4 and Storybook 10), then Vitest 4, then Storybook 10.
- Prefer Storybook's official `storybook upgrade` automigrations for the addon
  consolidation, then hand-verify `.storybook/main.ts` / `preview.tsx`.
- Regenerate `pnpm-lock.yaml` once per step; peer warnings that pre-date this
  ADR are acceptable (document any in status).
- Do NOT touch `apps/console` (no Vite/Vitest/Storybook there) beyond what the
  lockfile regeneration implies.
- A future ADR (when triggered) should decide React Compiler / plugin-react 6
  adoption; until then Dependabot may keep `@vitejs/plugin-react` on 5.x.

## References

- [Vitest 4 migration guide](https://vitest.dev/guide/migration.html)
- [Storybook 10 addon migration guide](https://storybook.js.org/docs/addons/addon-migration-guide)
- ADR-0040 (Next 16 upgrade) / ADR-0041 (Prisma 7 adoption) — prior dedicated
  dev-stack migration precedents
- `.cursor/rules/60-testing.mdc` (Vitest config discipline)
- `.cursor/rules/22-tailwind-shadcn.mdc` / ADR-0009 (Storybook UI-first)
- Dependabot PRs #8 / #23 / #24 / #28
