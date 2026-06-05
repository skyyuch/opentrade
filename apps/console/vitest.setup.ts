/**
 * Vitest setup for `@opentrade/console`.
 *
 * Mirrors `apps/web/vitest.setup.ts` (per ADR-0042): register jest-dom
 * matchers on Vitest 4's own `expect` instance (the externalised
 * auto-extend entry would land on a different chai instance under the
 * Module Runner), augment the `Matchers` interface, clean up RTL DOM
 * between tests (globals are off), and polyfill the jsdom gaps Next.js /
 * Tailwind / next-themes rely on.
 */

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:4000';
process.env['NEXT_PUBLIC_PRIVY_APP_ID'] = 'test-privy-app-id';
process.env['NEXT_PUBLIC_CHAIN_ID'] = '84532';

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type */
declare module 'vitest' {
  interface Matchers<T = any> extends TestingLibraryMatchers<any, T> {}
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type */

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  if (!('matchMedia' in window)) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }

  const noop = (): void => undefined;

  if (!('IntersectionObserver' in window)) {
    class FakeIntersectionObserver {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      root: Element | null = null;
      rootMargin = '';
      thresholds: readonly number[] = [];
    }
    (
      window as unknown as { IntersectionObserver: typeof FakeIntersectionObserver }
    ).IntersectionObserver = FakeIntersectionObserver;
  }

  if (!('ResizeObserver' in window)) {
    class FakeResizeObserver {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    }
    (window as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver =
      FakeResizeObserver;
  }
}
