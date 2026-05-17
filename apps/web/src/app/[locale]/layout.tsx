/**
 * Root layout for the locale-prefixed App Router segment.
 *
 * Owns `<html>` and `<body>` (Next.js requires the root layout to render
 * them). Validates the `[locale]` param against `routing.locales` and
 * surfaces a 404 if a malformed URL slips past the middleware. Loads the
 * resolved messages via `getMessages` and feeds them to
 * `NextIntlClientProvider` so Client Components can call
 * `useTranslations()` without re-fetching them.
 *
 * Tailwind global stylesheet, theme provider, and font setup land in t3
 * — this commit ships the routing skeleton only so the i18n plumbing
 * can be verified in isolation.
 */

import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { routing } from '../../i18n/routing';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  params: { locale: string };
};

export const generateStaticParams = (): { locale: string }[] =>
  routing.locales.map((locale) => ({ locale }));

const LocaleLayout = async ({ children, params }: Props): Promise<ReactNode> => {
  const { locale } = params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
};

export default LocaleLayout;
