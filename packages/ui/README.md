# `@opentrade/ui`

> OpenTrade design system + Storybook.

## Purpose

The visual language of OpenTrade. Every UI element shown in `apps/web` or `apps/console` must be assembled from components defined here. Per [ADR-0009](../../docs/decisions/0009-storybook-ui-first.md), we use a **Storybook-first workflow**.

## Structure (planned)

```
packages/ui/
├── src/
│   ├── design-tokens/
│   │   ├── colors.ts            # Brand palette
│   │   ├── typography.ts        # Source Han Serif / Sans / Inter
│   │   ├── spacing.ts
│   │   ├── shadows.ts
│   │   └── motion.ts
│   ├── primitives/              # shadcn/ui-based atoms
│   │   ├── Button/
│   │   ├── Input/
│   │   └── ...
│   ├── compounds/               # OpenTrade business components
│   │   ├── ReviewCard/
│   │   ├── BrokerProfileHeader/
│   │   ├── KOLSignalChart/
│   │   ├── JuryVotePanel/
│   │   └── ...
│   ├── stories/                 # Storybook-only files
│   └── index.ts
├── .storybook/                  # Storybook config (added in Phase 0.4)
└── package.json
```

## Critical rules (per cursor rule 22)

- ❌ Components MUST NOT import API clients or DB code (purely presentational)
- ❌ No business logic inside `packages/ui` — components receive everything via props
- ❌ Hard-coded colors / fonts not allowed; use design tokens
- ✅ Every compound component must have a `.stories.tsx` covering: default, edge cases, variants, three locales (zh-Hant, zh-Hans, en), light/dark mode

## Status

Phase 0 stub. Storybook + design tokens land in Commit #6.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.2.
