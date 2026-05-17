# `@opentrade/ui`

> OpenTrade design system + Storybook.

## Purpose

The visual language of OpenTrade. Every UI element shown in `apps/web` or `apps/console` must be assembled from components defined here. Per [ADR-0009](../../docs/decisions/0009-storybook-ui-first.md) we use a **Storybook-first workflow**, and per [ADR-0011](../../docs/decisions/0011-ui-design-language.md) the design language is "Civic Trust + Web3 tech feel" — dual-tone Sapphire + Gilded palette, hairline borders, restrained motion, and OpenTrade-unique visuals like `<ImmutableMark>`.

## Structure

```
packages/ui/
├── src/
│   ├── design-tokens/
│   │   ├── colors.ts          # Sapphire / Gilded / Emerald / Vermilion / Amber / Neutral (HSL triplets)
│   │   ├── typography.ts      # Inter + Source Han stack + JetBrains Mono
│   │   ├── spacing.ts         # 4-base scale
│   │   ├── radii.ts
│   │   ├── shadows.ts         # Hairline-first (very few floating shadows)
│   │   ├── motion.ts          # 150 / 250 / 400 ms ease-out
│   │   ├── breakpoints.ts     # 360 / 640 / 768 / 1024 / 1280 / 1536
│   │   └── z-index.ts         # Named layers
│   ├── utils/
│   │   └── cn.ts              # clsx + tailwind-merge
│   ├── primitives/            # shadcn-style atoms
│   │   └── button/            # Button (5 intents × 3 sizes, asChild, loading)
│   ├── compounds/             # OpenTrade business components
│   │   └── immutable-mark/    # ImmutableMark — the brand's signature visual
│   ├── styles/
│   │   └── globals.css        # Tailwind base + CSS custom properties (light + dark)
│   ├── stories/               # MDX docs + meta stories (Introduction, DesignTokens)
│   └── index.ts
├── .storybook/                # @storybook/react-vite config + light/dark decorator
├── tailwind.preset.ts         # Shared by apps/web, apps/console
├── tailwind.config.ts         # Storybook-local Tailwind config
└── package.json
```

## Commands

```bash
pnpm --filter @opentrade/ui storybook         # dev server on :6006
pnpm --filter @opentrade/ui build-storybook   # static build → storybook-static/
pnpm --filter @opentrade/ui typecheck
pnpm --filter @opentrade/ui lint
```

## Critical rules (per cursor rule 22 + ADR-0011)

- ❌ Components MUST NOT import API clients or DB code (purely presentational)
- ❌ No business logic inside `packages/ui` — components receive everything via props
- ❌ Hard-coded colours / fonts / spacing not allowed; use design tokens via Tailwind utilities
- ❌ Never render `<ImmutableMark>` for non-on-chain data (it would mislead users)
- ❌ Gilded accent (`bg-accent`) is sparingly used (≤ 10% of any view); reserve for SBT / verified / premium states
- ✅ Every compound has a `.stories.tsx` covering: default, edge cases, every variant, three locales (zh-Hant, zh-Hans, en), light + dark themes
- ✅ All numeric / chain-hash text uses `font-mono` or `font-numeric` (tabular figures)

## Consumer integration (planned)

`apps/web` and `apps/console` will:

```ts
// tailwind.config.ts
import preset from '@opentrade/ui/tailwind-preset';
export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};
```

```ts
// app/[locale]/layout.tsx
import '@opentrade/ui/styles/globals.css';
```

## Status

- ✅ Design tokens (8 files) — Commit #3
- ✅ `cn()` utility — Commit #3
- ✅ Storybook 8 + addons (a11y / themes / interactions) — Commit #3
- ✅ `<Button>` primitive (5 intents × 3 sizes, asChild, loading) — Commit #3
- ✅ `<ImmutableMark>` compound — Commit #3
- ⏳ More primitives (Input / Card / Dialog / Toast / …) — added as `apps/web` consumes them
- ⏳ More compounds (`<SBTBadge>`, `<ReviewCard>`, `<KOLSignalChart>`, …) — Phase 1
- ⏳ Source Han self-hosted fonts — Phase 0.5
- ⏳ Visual regression (Chromatic) — Phase 0 end

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.2 and [ADR-0011](../../docs/decisions/0011-ui-design-language.md).
