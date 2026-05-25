/**
 * Vitest setup for `@opentrade/web`.
 *
 * Runs once before any test file is evaluated. Three responsibilities:
 *
 *   1. Register `@testing-library/jest-dom` matchers (`toBeInTheDocument`,
 *      `toHaveTextContent`, …) onto Vitest's `expect`.
 *   2. Clean up RTL-rendered DOM between tests — required because Vitest
 *      runs with `globals: false`, so RTL's auto-cleanup hook is off.
 *   3. Polyfill jsdom gaps that Next.js / Tailwind / next-themes rely on
 *      (`window.matchMedia`, `IntersectionObserver`, `ResizeObserver`).
 *      Without these, mounting almost any UI primitive throws.
 *
 * Next.js navigation and `next-intl` hooks are NOT pre-mocked here — they
 * are mocked per-test or per-file with `vi.mock(...)` so individual tests
 * can stub the exact route / locale / messages they need.
 *
 * Network fetch is left untouched; tests that hit the network must opt in
 * via `vi.spyOn(globalThis, 'fetch')` and assert / restore explicitly,
 * which surfaces accidental real-network calls in CI.
 */

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:4000';
process.env['NEXT_PUBLIC_PRIVY_APP_ID'] = 'test-privy-app-id';
process.env['NEXT_PUBLIC_CHAIN_ID'] = '84532';

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

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
