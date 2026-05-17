/**
 * Storybook preview config.
 *
 * Wires the OpenTrade global stylesheet (Tailwind + CSS custom properties)
 * and exposes light/dark theme switching via `.dark` on `<html>`, matching
 * the runtime convention used by apps/web and apps/console.
 *
 * The viewport, backgrounds, and a11y configs are tuned to OpenTrade's
 * specific breakpoints (xs=360 / sm=640 / md=768 / lg=1024 / xl=1280) so
 * stories can be sanity-checked on real HK retail device widths.
 */
import { withThemeByClassName } from '@storybook/addon-themes';

import type { Preview } from '@storybook/react';

import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
      expanded: true,
    },
    backgrounds: { disable: true },
    layout: 'padded',
    viewport: {
      viewports: {
        mobileXs: { name: 'HK Mobile (360px)', styles: { width: '360px', height: '780px' } },
        mobileMd: { name: 'Mobile (640px)', styles: { width: '640px', height: '900px' } },
        tablet: { name: 'Tablet (768px)', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop (1280px)', styles: { width: '1280px', height: '800px' } },
        wide: { name: 'Wide (1536px)', styles: { width: '1536px', height: '900px' } },
      },
    },
    a11y: {
      config: {
        rules: [{ id: 'color-contrast', enabled: true }],
      },
    },
    docs: {
      toc: true,
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
  ],
  tags: ['autodocs'],
};

export default preview;
