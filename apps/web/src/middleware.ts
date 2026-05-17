/**
 * next-intl middleware: negotiates the locale from the URL prefix or the
 * `Accept-Language` header, sets a `NEXT_LOCALE` cookie, and rewrites
 * requests so that pages always receive a `[locale]` segment value.
 *
 * The matcher excludes:
 *   - `api` / `trpc` (no locale needed for backend calls)
 *   - `_next` / `_vercel` (framework internals)
 *   - any URL containing a dot (favicon.ico, sitemap.xml, etc.)
 *
 * Per cursor rule 51 we route under `as-needed` prefix mode — `zh-Hant`
 * URLs stay clean while `/zh-Hans/...` and `/en/...` are explicit.
 */

import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
