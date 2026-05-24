/**
 * Central routing configuration for `apps/console` consumed by next-intl's
 * middleware, request resolver, and navigation helpers.
 *
 * Per cursor rule 51 + ADR-0003 the supported locales are:
 *   - `zh-Hant`  (Traditional Chinese, default — primary HK market)
 *   - `zh-Hans`  (Simplified Chinese, mainland / cross-border users)
 *   - `en`       (English, international investors / regulators)
 *
 * Locale prefix is `always` — every URL carries the locale segment
 * (e.g. `/zh-Hant/admin/users`). This differs from `apps/web` which
 * uses `as-needed` for SEO-clean default-locale URLs. The console is
 * never indexed (robots disallow-all), so the SEO benefit of
 * `as-needed` does not apply. Using `always` avoids a class of
 * client-side routing issues where Next.js App Router's `[locale]`
 * dynamic segment mismatches non-prefixed paths (e.g. `/admin/users`
 * being matched as `[locale=admin]/users` → 404).
 */

import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-Hant', 'zh-Hans', 'en'],
  defaultLocale: 'zh-Hant',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];
