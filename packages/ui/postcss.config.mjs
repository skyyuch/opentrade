/**
 * Used by Storybook (Vite) and any tooling inside `@opentrade/ui` that needs
 * to compile globals.css standalone. Each consumer app (apps/web, apps/console)
 * supplies its own postcss.config.mjs.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
