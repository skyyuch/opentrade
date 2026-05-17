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
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
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
