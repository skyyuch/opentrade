/**
 * Client-side wrapper around `next-themes` so the rest of the app stays
 * in Server Component land. Per ADR-0011 `apps/console` defaults to
 * DARK (dashboard professional feel + reduced eye strain during long
 * admin sessions), with system preference enabled as an opt-in third
 * state for users who toggle from the eventual UI control.
 *
 * This is the single behavioural difference between apps/web's
 * ThemeProvider and this one — keep it that way. Anything else that
 * needs to differ between the apps belongs in the design tokens at
 * `packages/ui`, not here.
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
  <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
    {children}
  </NextThemesProvider>
);
