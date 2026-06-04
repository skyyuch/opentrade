/**
 * next-intl proxy (renamed from `middleware.ts` in Next.js 16): negotiates
 * the locale from the URL prefix or the
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
 *
 * Phase-1 expansion (per ADR-0010 §"Auth flow"):
 *   apps/console must redirect unauthenticated visitors to `/login`
 *   before any console route renders. That logic will compose on top of
 *   `createMiddleware(routing)` below — Privy session check first, then
 *   delegate to the i18n middleware for path negotiation. Until the
 *   auth flow lands in Phase 1 the shell is intentionally browsable so
 *   the design system can be reviewed without standing up KYC.
 */

import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
