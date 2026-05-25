// @ts-check
/**
 * Per-workspace ESLint config for @opentrade/shared.
 *
 * Inherits all rules from the root config. Only divergence: `vitest.config.ts`
 * is excluded from lint because this workspace's main `tsconfig.json` uses
 * `composite: true` with `rootDir: "./src"` (required by the
 * `packages/ui` → `packages/shared` TS project reference). That constraint
 * forbids including the workspace-root `vitest.config.ts` in the build
 * tsconfig, which in turn means typescript-eslint's project service cannot
 * type-check it. ESLint skipping the file is acceptable here because Vitest
 * itself validates `vitest.config.ts` (via Vite's TypeScript pipeline) every
 * time it boots — TS errors there fail `pnpm test:unit` immediately.
 */

import rootConfig from '../../eslint.config.mjs';

export default [
  ...rootConfig,
  {
    ignores: ['vitest.config.ts'],
  },
];
