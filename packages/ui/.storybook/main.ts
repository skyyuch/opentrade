/**
 * Storybook entrypoint for `@opentrade/ui`.
 *
 * Per ADR-0009 Storybook is the design system's primary dev surface. Every
 * primitive and compound MUST ship with a `.stories.tsx` file co-located with
 * the component.
 *
 * Framework: `@storybook/react-vite` for sub-second HMR.
 */
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  // Storybook 10 folded viewport/controls/interactions/actions into core, so
  // `@storybook/addon-essentials` and `@storybook/addon-interactions` are gone
  // (per ADR-0042). Docs is now an explicit `@storybook/addon-docs` opt-in.
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-themes'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    // Storybook 10 removed `docs.autodocs`; autodocs is now opt-in via the
    // `autodocs` tag set in `.storybook/preview.tsx` (per ADR-0042).
    defaultName: 'Documentation',
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !prop.parent.fileName.includes('node_modules') : true),
    },
  },
  core: {
    disableTelemetry: true,
  },
};

export default config;
