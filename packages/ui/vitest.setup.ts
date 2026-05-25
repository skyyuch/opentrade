/**
 * Vitest setup for `@opentrade/ui`.
 *
 * Registers `@testing-library/jest-dom` matchers (`toHaveAccessibleName`,
 * `toHaveAttribute`, …) onto Vitest's `expect`, and tears down the RTL
 * DOM between tests — required because we run Vitest with
 * `globals: false`, so RTL's auto-cleanup hook is off.
 *
 * No global polyfills here: primitives in `@opentrade/ui` deliberately
 * avoid browser APIs that jsdom is missing (`matchMedia`,
 * `IntersectionObserver`, …); any test that needs one must polyfill
 * inline so the dependency is visible at the call site.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
