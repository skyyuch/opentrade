/**
 * tsup build configuration for `@opentrade/api`.
 *
 * Produces two entry points:
 *   - `dist/main.js`     — Hono API server (default CMD in Dockerfile)
 *   - `dist/sync-sfc.js` — SFC broker sync task (ECS CMD override, ADR-0020)
 *
 * Bundling strategy:
 *   - Workspace packages (`@opentrade/*`) are inlined into the bundle.
 *     Their source uses ESM-correct `.js` import specifiers that resolve
 *     under tsx (dev) and esbuild (this build) but fail under plain Node,
 *     so leaving them external would break `node dist/main.js`. Bundling
 *     also frees the container image from having to replay pnpm's
 *     workspace symlink topology.
 *   - `@prisma/client` stays external. Prisma's generated engine binaries
 *     are loaded by absolute path at runtime; bundling them breaks engine
 *     detection. The production Dockerfile (Commit #9) will copy the
 *     pnpm-resolved client + engines next to dist/.
 *   - `pino-pretty` stays external too — it's a dev-only transport that
 *     should not be shipped in the production image at all.
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/tasks/sync-sfc.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: false,
  external: ['@prisma/client', '.prisma/client', 'pino-pretty'],
  noExternal: [/^@opentrade\//],
});
