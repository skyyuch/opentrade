/**
 * PostCSS pipeline for `@opentrade/console`. Mirrors the one used by
 * `apps/web` and `packages/ui` Storybook so the three stay in lock-step.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
