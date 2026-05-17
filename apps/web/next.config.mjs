// @ts-check
/**
 * Next.js config for `@opentrade/web`.
 *
 * - `transpilePackages`: include workspace packages whose `main` is raw TS
 *   (`@opentrade/ui`, `@opentrade/shared`, `@opentrade/config`). Without
 *   this, Next 14 errors out on `import` from a package whose entry is
 *   `./src/index.ts` instead of compiled `.js`.
 * - `reactStrictMode`: catches accidental side-effects in development.
 * - `poweredByHeader: false`: drops the `X-Powered-By: Next.js` header so
 *   we don't advertise stack details.
 * - `experimental.typedRoutes`: enables `<Link href="...">` autocompletion
 *   sourced from the App Router file system.
 *
 * The next-intl plugin wraps the config with i18n request handling; see
 * `src/i18n/request.ts` for the per-request resolver.
 *
 * Tooling note (vs apps/api):
 *   `apps/web` source files use BARE relative specifiers (`./routing`)
 *   without the `.js` extension because Next 14's webpack resolver does
 *   not rewrite `.js` → `.ts` for in-app sources. `apps/api` does the
 *   opposite (`./routing.js`) because tsx + tsup require ESM-correct
 *   specifiers; per ADR-0014 each package follows its own bundler's
 *   contract. Workspace packages imported through `@opentrade/*` are
 *   transpiled by Next so the asymmetry is invisible to consumers.
 */

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@opentrade/ui', '@opentrade/shared', '@opentrade/config'],
  experimental: {
    typedRoutes: true,
  },
};

export default withNextIntl(nextConfig);
