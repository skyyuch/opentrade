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
 *   - `<ThemeProvider>` defaults to **dark** (per ADR-0011 — dashboards
 *     are dark for professional feel + long-session eye comfort).
 *
 * SEO posture (ADR-0010):
 *   `robots` metadata explicitly opts out of indexing and following.
 *   `app/robots.ts` (added in Commit number-seven step `t6`) re-states
 *   the same intent at the protocol level so well-behaved crawlers see
 *   it twice. Production deployment will additionally send an
 *   `X-Robots-Tag: noindex, nofollow` header from the edge.
 */

import '../../styles/console-globals.css';

import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';

import { AuthGate } from '../../components/layout/AuthGate';
import { ThemeProvider } from '../../components/providers/ThemeProvider';
import { Web3Providers } from '../../components/providers/Web3Providers';
import { CurrentUserProvider } from '../../hooks/useCurrentUser';
import { OpenTradeAuthProvider } from '../../hooks/useOpenTradeAuth';
import { routing } from '../../i18n/routing';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export const generateStaticParams = (): { locale: string }[] =>
  routing.locales.map((locale) => ({ locale }));

export const generateMetadata = async (props: Props): Promise<Metadata> => {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'dashboard' });

  return {
    title: t('title'),
    description: t('subtitle'),
    robots: { index: false, follow: false },
  };
};

const LocaleLayout = async (props: Props): Promise<ReactNode> => {
  const { children } = props;
  const { locale } = await props.params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-[#050608] text-white antialiased`}>
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <OpenTradeAuthProvider>
              <CurrentUserProvider>
                <Web3Providers>
                  <AuthGate>{children}</AuthGate>
                </Web3Providers>
              </CurrentUserProvider>
            </OpenTradeAuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default LocaleLayout;
