// @ts-check
/**
 * Commitlint config — enforces Conventional Commits per cursor rule 70.
 * Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
 * Allowed scopes (initial set, expand as we add packages):
 *   web, console, api, contracts, db, ui, shared, config,
 *   infra, docs, decisions, conversations, rules, deps, release, ci, status, i18n
 *
 * `status` is reserved for `docs/03-status.md` updates per rule 97 — these
 * happen at the end of every session and deserve their own scope so they
 * don't get lumped into a generic `docs(docs):`.
 *
 * `decisions` is reserved for ADR commits under `docs/decisions/`. ADR
 * commits are common enough (per rule 97) and structurally distinct
 * from generic docs to warrant their own scope.
 *
 * `conversations` is reserved for session archive commits under
 * `docs/conversations/`. These follow the rule 97 + rule 98 handoff
 * cadence (one per ship-worthy session) and are structurally distinct
 * from generic docs.
 *
 * `i18n` is reserved for translation-only changes that span both apps
 * (e.g. renaming a sentiment label across web + console + packages/ui
 * + schema docs in zh-Hant + zh-Hans). Mixed feat/refactor commits that
 * happen to touch i18n strings should still use the surface scope
 * (web / console / ui).
 */

/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-enum': [
      1, // warning — gradually tighten as the project matures
      'always',
      [
        'web',
        'console',
        'api',
        'contracts',
        'db',
        'ui',
        'shared',
        'config',
        'infra',
        'docs',
        'decisions',
        'conversations',
        'rules',
        'deps',
        'release',
        'ci',
        'status',
        'i18n',
      ],
    ],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
};

export default config;
