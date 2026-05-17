/**
 * @opentrade/ui
 *
 * OpenTrade's design system. Per ADR-0009 we use a Storybook-first workflow:
 * components are built and visually verified in Storybook BEFORE they are
 * used by `apps/web` or `apps/console`.
 *
 * Per ADR-0011 the visual language is "Civic Trust + Web3 tech feel" with
 * dual-tone Sapphire + Gilded palette and OpenTrade-unique visuals
 * (ImmutableMark, SBT badges, on-chain transparency hierarchy).
 *
 * Layout:
 *   src/design-tokens/  — colours, typography, spacing, shadows, motion
 *   src/utils/          — `cn()` and other framework-agnostic helpers
 *   src/primitives/     — shadcn-style atomic components
 *   src/compounds/      — OpenTrade business components
 *   src/styles/         — global CSS (Tailwind base + CSS custom properties)
 *
 * See docs/01-architecture.md §4.2 and ADR-0011.
 */

export const PACKAGE_NAME = '@opentrade/ui' as const;

export * from './design-tokens';
export * from './utils';
export * from './primitives';
export * from './compounds';
