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
 * Style + theme wiring (ADR-0011):
 *   - `@opentrade/ui/styles/globals.css` is the single source of truth
 *     for the OpenTrade visual base layer (Tailwind reset + CSS custom
 *     properties for light / dark themes).
 *   - `next/font/google` for Inter is "self-hosted" in Next 14 — fonts
 *     are downloaded at build time and served from the same origin, so
 *     no runtime requests hit Google CDN (satisfies the GDPR concern in
 *     rule 22). Source Han self-hosting lands in Phase 0.5 per ADR-0011
 *     §3 Implementation Notes.
 *   - `<ThemeProvider>` wraps `<NextIntlClientProvider>` so a future
 *     theme toggle button (Client Component) can call `useTheme()`
 *     anywhere inside the locale segment.
 */

import '@opentrade/ui/styles/globals.css';

import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';

import { ThemeProvider } from '../../components/providers/ThemeProvider';
import { Web3Providers } from '../../components/providers/Web3Providers';
import { routing } from '../../i18n/routing';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Inter via `next/font/google` — Next 14 downloads the font at build time
 * and serves it from the same origin (no runtime hit on Google's CDN, so
 * the GDPR concern in rule 22 is satisfied even though the loader name
 * suggests otherwise). Source Han self-hosting follows in Phase 0.5 per
 * ADR-0011 §3 Implementation Notes.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

type Props = {
  children: ReactNode;
  params: { locale: string };
};

export const generateStaticParams = (): { locale: string }[] =>
  routing.locales.map((locale) => ({ locale }));

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const t = await getTranslations({ locale: params.locale, namespace: 'home' });

  return {
    title: t('title'),
    description: t('tagline'),
    robots: { index: true, follow: true },
  };
};

const LocaleLayout = async ({ children, params }: Props): Promise<ReactNode> => {
  const { locale } = params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <Web3Providers>{children}</Web3Providers>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default LocaleLayout;
