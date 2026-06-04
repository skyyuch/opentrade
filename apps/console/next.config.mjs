// @ts-check
/**
 * Next.js config for `@opentrade/console`.
 *
 * Mirrors the structure of `apps/web/next.config.mjs` because the two
 * apps share design system, env loading strategy, and i18n routing per
 * ADR-0010. Differences live in three places only:
 *
 *   1. ThemeProvider defaults to dark (per ADR-0011 — dashboards are
 *      dark to reduce eye strain during long admin sessions).
 *   2. dev port is 3001 so it can run alongside apps/web on 3000.
 *      apps/api's CORS_ORIGIN already whitelists that origin since
 *      Commit number-five.
 *   3. `app/robots.ts` returns disallow-all + the production deployment
 *      will also send `X-Robots-Tag: noindex, nofollow` headers (added
 *      in Commit number-seven step `t6`) because console is private.
 *
 * Tooling note (vs apps/api):
 *   `apps/console` source files use BARE relative specifiers (`./routing`)
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
  transpilePackages: ['@opentrade/ui', '@opentrade/shared', '@opentrade/config'],
  typedRoutes: true,
  // See apps/web/next.config.mjs for the full rationale: Next 16's Turbopack
  // dev server rejects the HMR websocket when the page is opened via a
  // non-launch origin (e.g. `127.0.0.1`), which stalls hydration. Whitelist
  // the loopback IP so dev/e2e over `127.0.0.1` hydrate. Dev-only knob.
  allowedDevOrigins: ['127.0.0.1'],
};

export default withNextIntl(nextConfig);
