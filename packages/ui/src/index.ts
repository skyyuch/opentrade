/**
 * @opentrade/ui
 *
 * OpenTrade's design system. Per ADR-0009 we use a Storybook-first workflow:
 * components are built and visually verified in Storybook BEFORE they are
 * used by `apps/web` or `apps/console`.
 *
 * Layout:
 *   src/design-tokens/  — colors, typography, spacing, shadows, motion
 *   src/primitives/     — shadcn/ui–based atomic components
 *   src/compounds/      — OpenTrade business components
 *
 * See docs/01-architecture.md §4.2.
 */

export const PACKAGE_NAME = '@opentrade/ui' as const;
