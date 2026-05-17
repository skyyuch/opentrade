/**
 * Central routing configuration for `apps/web` consumed by next-intl's
 * middleware, request resolver, and navigation helpers.
 *
 * Per cursor rule 51 + ADR-0003 the supported locales are:
 *   - `zh-Hant`  (Traditional Chinese, default — primary HK market)
 *   - `zh-Hans`  (Simplified Chinese, mainland / cross-border users)
 *   - `en`       (English, international investors / regulators)
 *
 * Locale prefix is `as-needed` so the default locale (`zh-Hant`) renders
 * at `/foo` while explicit alternates render at `/zh-Hans/foo` or
 * `/en/foo`. This keeps SEO clean for the primary market while letting
 * power users link to a specific locale variant when needed.
 */

import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-Hant', 'zh-Hans', 'en'],
  defaultLocale: 'zh-Hant',
  localePrefix: 'as-needed',
});

export type AppLocale = (typeof routing.locales)[number];
