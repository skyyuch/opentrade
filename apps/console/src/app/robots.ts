/**
 * Site-level robots policy for `apps/console`.
 *
 * Per ADR-0010 the console is a private back-office surface. We
 * disallow all crawlers at the protocol level here; the production
 * deployment will additionally send `X-Robots-Tag: noindex, nofollow`
 * from the edge so misbehaving bots that ignore robots.txt still get
 * an explicit signal.
 *
 * Placement: this file lives at `src/app/robots.ts` (NOT under the
 * `[locale]` segment) because robots.txt is a single site-level
 * resource — it must not vary by locale and must not require the
 * locale prefix to be served. The next-intl middleware matcher
 * already excludes paths containing a dot (`/robots.txt` matches
 * `.*\\..*`), so the request bypasses i18n negotiation entirely.
 *
 * See:
 *   - ADR-0010 §"apps/console" (no SEO; robots.txt all disallow)
 *   - .cursor/rules/50-security.mdc (private surfaces stay private)
 *   - https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import type { MetadataRoute } from 'next';

const robots = (): MetadataRoute.Robots => ({
  rules: {
    userAgent: '*',
    disallow: '/',
  },
});

export default robots;
