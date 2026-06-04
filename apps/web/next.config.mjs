// @ts-check
/**
 * Next.js config for `@opentrade/web`.
 *
 * - `transpilePackages`: include workspace packages whose `main` is raw TS
 *   (`@opentrade/ui`, `@opentrade/shared`, `@opentrade/config`). Without
 *   this, Next errors out on `import` from a package whose entry is
 *   `./src/index.ts` instead of compiled `.js`.
 * - `reactStrictMode`: catches accidental side-effects in development.
 * - `poweredByHeader: false`: drops the `X-Powered-By: Next.js` header so
 *   we don't advertise stack details.
 * - `typedRoutes`: enables `<Link href="...">` autocompletion sourced from
 *   the App Router file system. Graduated out of `experimental` in Next 16.
 *
 * The next-intl plugin wraps the config with i18n request handling; see
 * `src/i18n/request.ts` for the per-request resolver.
 *
 * Tooling note (vs apps/api):
 *   `apps/web` source files use BARE relative specifiers (`./routing`)
 *   without the `.js` extension because Next's bundler (Turbopack as of
 *   Next 16) resolves in-app sources without `.js` → `.ts` rewriting.
 *   `apps/api` does the opposite (`./routing.js`) because tsx + tsup
 *   require ESM-correct specifiers; per ADR-0014 each package follows its
 *   own bundler's contract. Workspace packages imported through
 *   `@opentrade/*` are transpiled by Next so the asymmetry is invisible.
 */

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Build output dir is overridable so the Playwright e2e harness can
  // build into `.next-e2e/` and avoid sharing the bundler's persistent
  // cache with the developer's long-running `pnpm dev` process.
  // Sharing the same `.next/cache/` between two `next dev` processes
  // (one from the user, one spawned by Playwright with a different
  // `NEXT_PUBLIC_API_URL`) lets module bytecode poisoned with the e2e
  // stub URL leak into the dev session — symptom is the user's app
  // suddenly calling `127.0.0.1:4010` after an e2e run. Per cursor rule
  // 60 the e2e harness must be hermetic; the `NEXT_DIST_DIR` env knob is
  // how `apps/web/playwright.config.ts` enforces that.
  distDir: process.env['NEXT_DIST_DIR'] ?? '.next',
  transpilePackages: ['@opentrade/ui', '@opentrade/shared', '@opentrade/config'],
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
