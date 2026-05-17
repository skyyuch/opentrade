/**
 * PostCSS pipeline for `@opentrade/web`. Mirrors the one used by
 * `packages/ui` Storybook so the two stay in lock-step.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
