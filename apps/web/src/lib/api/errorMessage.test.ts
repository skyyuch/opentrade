/**
 * Sanity tests for `translateApiError`. Doubles as the canary for the web
 * workspace's Vitest stack (M6.0): if this file fails to compile or run,
 * the workspace's test infrastructure is broken before any component
 * surface relies on it.
 *
 * Coverage targets every branch of the two-tier mapping (`details.reason`
 * → `code` → fallback). The translator is stubbed with an identity
 * function so the test never depends on the real `next-intl` runtime.
 */

import { describe, expect, it } from 'vitest';

import { ApiClientError } from './client';
import { translateApiError } from './errorMessage';

const tEcho = (key: string): string => key;

describe('translateApiError', () => {
  it('prefers a details.reason mapping when the reason is allow-listed', () => {
    const err = new ApiClientError(409, 'CONFLICT', 'conflict', {
      details: { reason: 'pending_exists' },
    });
    expect(translateApiError(err, tEcho)).toBe('reason.pending_exists');
  });

  it('falls back to the code mapping when the reason is unknown', () => {
    const err = new ApiClientError(409, 'CONFLICT', 'conflict', {
      details: { reason: 'unmapped_reason' },
    });
    expect(translateApiError(err, tEcho)).toBe('code.CONFLICT');
  });

  it('returns the generic INTERNAL_ERROR copy when the code is also unknown', () => {
    const err = new ApiClientError(500, 'UNMAPPED_CODE', 'boom');
    expect(translateApiError(err, tEcho)).toBe('code.INTERNAL_ERROR');
  });

  it('honours the explicit fallbackText for non-ApiClientError throwables', () => {
    expect(translateApiError(new TypeError('network'), tEcho, 'errors.network')).toBe(
      'errors.network',
    );
  });

  it('falls back to INTERNAL_ERROR when no explicit fallback is given', () => {
    expect(translateApiError(new TypeError('network'), tEcho)).toBe('code.INTERNAL_ERROR');
  });
});
