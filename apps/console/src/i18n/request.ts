/**
 * Per-request locale resolver consumed by next-intl. Loaded by the plugin
 * configured in `next.config.mjs` (`createNextIntlPlugin`). Returning the
 * loaded messages here makes them available to every Server Component
 * via `getTranslations()` and to Client Components via the
 * `<NextIntlClientProvider>` wrap in the locale layout.
 *
 * If the segment-derived locale is unknown (e.g. a malformed URL slipped
 * past the middleware), we fall back to `routing.defaultLocale` — the
 * layout's `hasLocale` guard then renders a 404 for the user, but at
 * least the rendering pipeline does not crash on a missing message file.
 */

import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)) as { default: Messages };

  return {
    locale,
    messages: messages.default,
  };
});

type Messages = Record<string, unknown>;
