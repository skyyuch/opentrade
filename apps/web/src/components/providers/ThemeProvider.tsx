/**
 * Client-side wrapper around `next-themes` so the rest of the app stays
 * in Server Component land.
 *
 * Phase 1: forced dark mode to align with crypto exchange aesthetics
 * (Binance, OKX). A theme toggle can be re-introduced in Phase 2+.
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
  <NextThemesProvider
    attribute="class"
    defaultTheme="dark"
    forcedTheme="dark"
    disableTransitionOnChange
  >
    {children}
  </NextThemesProvider>
);
