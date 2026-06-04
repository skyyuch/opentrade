/**
 * tsup build configuration for `@opentrade/api`.
 *
 * Produces three entry points:
 *   - `dist/main.js`              — Hono API server (default CMD in Dockerfile)
 *   - `dist/tasks/sync-sfc.js`    — SFC broker sync task (ECS CMD override, ADR-0020)
 *   - `dist/tasks/outbox-worker.js` — Outbox event processor (on-chain anchoring)
 *
 * Bundling strategy:
 *   - Workspace packages (`@opentrade/*`) are inlined into the bundle.
 *     Their source uses ESM-correct `.js` import specifiers that resolve
 *     under tsx (dev) and esbuild (this build) but fail under plain Node,
 *     so leaving them external would break `node dist/main.js`. Bundling
 *     also frees the container image from having to replay pnpm's
 *     workspace symlink topology.
 *   - The Prisma 7 generated client lives inside `@opentrade/db`
 *     (src/generated/prisma) and is inlined with the rest of the workspace,
 *     but its runtime (`@prisma/client`), the Postgres driver adapter
 *     (`@prisma/adapter-pg`), and the underlying `pg` driver stay external.
 *     They are resolved from node_modules at runtime (ADR-0041); `pg` ships
 *     no Rust engine binaries to copy — the v7 client is Rust-free.
 *   - `pino-pretty` stays external too — it's a dev-only transport that
 *     should not be shipped in the production image at all.
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/tasks/sync-sfc.ts', 'src/tasks/outbox-worker.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: false,
  external: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'pino-pretty'],
  noExternal: [/^@opentrade\//],
});
