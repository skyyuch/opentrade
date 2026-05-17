/**
 * Design tokens — the single source of truth for OpenTrade's visual language.
 *
 * See ADR-0011 for the design philosophy ("Civic Trust + Web3 tech feel"),
 * and ADR-0009 for the Storybook-first workflow that requires tokens to exist
 * before any component is built.
 *
 * Consumers:
 *   - `tailwind.preset.ts` reads tokens to build the Tailwind theme
 *   - `src/styles/globals.css` mirrors semantic tokens into CSS custom
 *     properties for runtime light/dark switching
 *   - apps/web, apps/console extend the preset and inherit globals.css
 */

export {
  palette,
  semantic,
  type PaletteScale,
  type PaletteShade,
  type SemanticToken,
} from './colors';
export { fontFamily, fontSize, fontWeight, letterSpacing } from './typography';
export { spacing, type SpacingKey } from './spacing';
export { borderRadius } from './radii';
export { boxShadow } from './shadows';
export { transitionDuration, transitionTimingFunction } from './motion';
export { screens } from './breakpoints';
export { zIndex } from './z-index';
