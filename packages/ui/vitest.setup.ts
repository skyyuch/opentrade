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
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 4's Module Runner no longer shares the `expect` instance with the
// externalised `@testing-library/jest-dom/vitest` auto-extend entry (matchers
// would register on a different chai instance → "Invalid Chai property"), and
// 4.1.6+ also stopped merging external augmentation of the `Assertion`
// interface. So we register the matchers on the runner's own `expect` here and
// augment `Matchers` (the target Vitest 4 still reads). See ADR-0042.
// Module augmentation must use `interface` and mirror the upstream `any`
// signatures, so the relevant style rules are disabled for this block only.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type */
declare module 'vitest' {
  interface Matchers<T = any> extends TestingLibraryMatchers<any, T> {}
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type */

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
