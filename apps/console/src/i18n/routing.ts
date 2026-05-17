/**
 * Central routing configuration for `apps/console` consumed by next-intl's
 * middleware, request resolver, and navigation helpers.
 *
 * Mirrors `apps/web/src/i18n/routing.ts` because per ADR-0010 the two
 * apps share the same locale set and prefix policy — diverging would
 * fragment the brand experience for users who cross from the public
 * site into the back office.
 *
 * Per cursor rule 51 + ADR-0003 the supported locales are:
 *   - `zh-Hant`  (Traditional Chinese, default — primary HK market)
 *   - `zh-Hans`  (Simplified Chinese, mainland / cross-border users)
 *   - `en`       (English, international investors / regulators)
 *
 * Locale prefix is `as-needed` so the default locale (`zh-Hant`) renders
 * at `/foo` while explicit alternates render at `/zh-Hans/foo` or
 * `/en/foo`. Console pages are never indexed by search engines (per
 * `app/robots.ts` + the production `X-Robots-Tag` header), so the SEO
 * argument that drove this choice on apps/web does not apply — but
 * keeping the policies aligned simplifies cross-app deep linking
 * (e.g. an email notification linking from web → console).
 */

import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-Hant', 'zh-Hans', 'en'],
  defaultLocale: 'zh-Hant',
  localePrefix: 'as-needed',
});

export type AppLocale = (typeof routing.locales)[number];
