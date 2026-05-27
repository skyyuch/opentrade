// @ts-check
/**
 * OpenTrade root ESLint flat config.
 *
 * This is the base config every package extends. It enforces the rules described in
 * `.cursor/rules/20-typescript.mdc`. Package-level `eslint.config.mjs` files may add
 * framework-specific rules (Next.js, React, Solidity-via-eslint, etc.) but must not
 * relax the rules defined here.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Globally ignored patterns
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/.next-e2e/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      '**/storybook-static/**',
      '**/cache/**',
      '**/artifacts/**',
      '**/typechain-types/**',
      '**/*.mdx',
    ],
  },

  // Base recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Type-aware linting requires referencing the project's tsconfig.
  // Each package can override `parserOptions.project` in its own config.
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver': {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
    },
    rules: {
      // ── OpenTrade strict TypeScript rules (per cursor rule 20) ──────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',

      // Prefer `type` over `interface` (rule 20) — overrides stylistic default.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

      // No `enum` — use const object + as const + union type instead
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Do not use TypeScript enum. Use a const object with `as const` plus a union type instead. See .cursor/rules/20-typescript.mdc.',
        },
      ],

      // ── Console / debugging ──────────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',

      // ── Imports ──────────────────────────────────────────────────────────────
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            {
              pattern: '@opentrade/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-default-export': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/no-self-import': 'error',
      'import-x/no-duplicates': 'error',
    },
  },

  // Tests / scripts may relax some rules
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      '**/scripts/**',
      '**/*.config.{ts,mjs,js}',
    ],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Vitest / RTL assertion expressions like
      // `expect(repo.create).toHaveBeenCalled()` reference a method
      // without binding `this`. The rule mistakes the assertion target
      // for an unbound method invocation. Disabling here matches the
      // typescript-eslint maintainers' own recommendation for test
      // files (typescript-eslint#1303).
      '@typescript-eslint/unbound-method': 'off',
      'import-x/no-default-export': 'off',
      'no-console': 'off',
    },
  },

  // Storybook config + stories conventionally use default exports
  {
    files: [
      '**/.storybook/**/*.{ts,tsx}',
      '**/*.stories.@(ts|tsx)',
      '**/tailwind.preset.{ts,js,mjs}',
    ],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // Next.js App Router conventions require default exports on a fixed set
  // of file names (per Next 14 file-system routing). next-intl's request
  // resolver and the framework middleware also expect default exports.
  // These are framework contracts, not opinions; the rule must yield.
  {
    files: [
      'apps/{web,console}/src/app/**/{page,layout,template,default,error,not-found,loading,route,manifest,sitemap,robots,icon,apple-icon,opengraph-image,twitter-image}.{ts,tsx}',
      'apps/{web,console}/src/middleware.{ts,tsx}',
      'apps/{web,console}/src/i18n/request.{ts,tsx}',
      'apps/{web,console}/next.config.{mjs,js,ts}',
    ],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // Architecture boundary enforcement (per .cursor/rules/10-architecture.mdc):
  // Frontend apps (web, console) must never reach the DB layer at runtime.
  // All data access goes through apps/api. Type-only imports of model
  // shapes from @opentrade/db are still allowed (the type-only escape
  // hatch from rule 10), but anything that survives `import type` erasure
  // — values, namespaces, side-effectful imports — is blocked.
  //
  // @prisma/client is also blocked because it is the underlying database
  // engine; if it ever shows up in a frontend bundle that is the same
  // boundary violation by a different path. apps/api owns the only
  // legitimate runtime use of @prisma/client (per ADR-0014).
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/console/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@opentrade/db', '@opentrade/db/*'],
              message:
                'Frontend apps must not runtime-import @opentrade/db. ' +
                'Use `import type { ... } from "@opentrade/db"` for model ' +
                'shape, and fetch data via apps/api. See .cursor/rules/' +
                '10-architecture.mdc and ADR-0006.',
              allowTypeImports: true,
            },
            {
              group: ['@prisma/client', '@prisma/client/*'],
              message:
                'Frontend apps must not runtime-import @prisma/client. ' +
                'Database access is server-only per .cursor/rules/' +
                '10-architecture.mdc, ADR-0014, and rule 50.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // Plain JS files — turn off type-aware rules
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Prettier — must be last to disable conflicting style rules
  prettier,
);
