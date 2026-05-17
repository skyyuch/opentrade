/**
 * Client-side wrapper around `next-themes` so the rest of the app stays
 * in Server Component land. Per ADR-0011 `apps/web` defaults to LIGHT
 * (SEO + retail reading habit), with system preference enabled as an
 * opt-in third state for users who toggle from the eventual UI control.
 *
 * `attribute="class"` toggles `.dark` on `<html>` — the design token CSS
 * variables in `@opentrade/ui/styles/globals.css` swap atomically.
 *
 * `disableTransitionOnChange` avoids the colour flash that otherwise
 * happens when every CSS custom property animates simultaneously.
 */

'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export const ThemeProvider = ({ children }: Props) => (
  <NextThemesProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
    {children}
  </NextThemesProvider>
);
