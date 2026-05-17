// @ts-check

/**
 * @type {import("prettier").Config}
 */
const config = {
  // Width
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,

  // Quotes
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',

  // Trailing
  semi: true,
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',

  // Line endings — match .editorconfig
  endOfLine: 'lf',

  // Plugins (will be expanded as we add Tailwind, sort-imports, etc.)
  plugins: [],

  // Per-file overrides
  overrides: [
    {
      files: '*.md',
      options: {
        printWidth: 80,
        proseWrap: 'preserve',
      },
    },
    {
      files: ['*.json', '*.jsonc'],
      options: {
        printWidth: 120,
      },
    },
    {
      files: ['*.yaml', '*.yml'],
      options: {
        singleQuote: false,
      },
    },
    {
      files: ['*.sol'],
      options: {
        printWidth: 120,
        tabWidth: 4,
      },
    },
  ],
};

export default config;
